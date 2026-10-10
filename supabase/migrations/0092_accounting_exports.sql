-- Accounting exports: a GST sales register (CSV) and Tally-importable sales
-- vouchers (XML). Both cover paid, non-cancelled orders in the date range.

-- GST register: one row per order, tax split into CGST and SGST.
create or replace function public.export_gst_register_csv(p_from date, p_to date)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_gstin text;
  v_out text;
begin
  if not public.has_permission('reports.financial.view') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select coalesce(gstin, '') into v_gstin from public.tenants where id = v_tenant;

  select 'Date,Invoice no,Order type,Customer,Customer phone,Taxable value,CGST,SGST,Total tax,Invoice total,Payment method,Restaurant GSTIN' || E'\n' ||
         coalesce(string_agg(
           concat_ws(',',
             public.csv_cell(to_char(o.created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD')),
             public.csv_cell(o.order_number),
             public.csv_cell(o.order_type),
             public.csv_cell(coalesce(c.name, o.contact_name, '')),
             public.csv_cell(coalesce(c.phone, '')),
             to_char((o.total_minor - o.tax_minor) / 100.0, 'FM999999990.00'),
             to_char(floor(o.tax_minor / 2.0) / 100.0, 'FM999999990.00'),
             to_char(ceil(o.tax_minor / 2.0) / 100.0, 'FM999999990.00'),
             to_char(o.tax_minor / 100.0, 'FM999999990.00'),
             to_char(o.total_minor / 100.0, 'FM999999990.00'),
             public.csv_cell(coalesce(pm.methods, '')),
             public.csv_cell(v_gstin)
           ), E'\n' order by o.created_at), '')
  into v_out
  from public.orders o
  left join public.customers c on c.id = o.customer_id
  left join lateral (
    select string_agg(distinct p.method, '+') as methods from public.payments p
    where p.order_id = o.id and p.status in ('paid', 'cash_received', 'reconciled')
  ) pm on true
  where o.tenant_id = v_tenant
    and o.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
    and o.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
    and o.order_status not in ('rejected', 'cancelled')
    and o.payment_status in ('paid', 'cash_received', 'reconciled');
  return v_out;
end;
$$;

create or replace function public.xml_escape(p text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&apos;');
$$;

-- Tally Prime / ERP 9 import file: one Sales voucher per day.
--   Dr  Cash / UPI / Card / House accounts  (what was collected, by method)
--   Cr  Sales                                (food and delivery, net of discount)
--   Cr  CGST, SGST                           (tax collected, split equally)
--   Dr/Cr Round Off                          (only if payments differ by paise)
-- Ledger names can be changed to match the books; they must already exist in Tally.
create or replace function public.export_tally_xml(
  p_from date,
  p_to date,
  p_sales_ledger text default 'Sales',
  p_cgst_ledger text default 'CGST',
  p_sgst_ledger text default 'SGST',
  p_cash_ledger text default 'Cash',
  p_upi_ledger text default 'UPI Receipts',
  p_card_ledger text default 'Card Receipts',
  p_account_ledger text default 'Sundry Debtors',
  p_roundoff_ledger text default 'Round Off'
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_company text;
  v_out text;
  d record;
  v_entries text;
  v_debits bigint;
  v_credits bigint;
  v_diff bigint;
  v_cgst bigint;
  v_sgst bigint;
  m record;
  v_vouchers text := '';
begin
  if not public.has_permission('reports.financial.view') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select name into v_company from public.tenants where id = v_tenant;

  for d in
    select (o.created_at at time zone 'Asia/Kolkata')::date as day,
           sum(o.total_minor - o.tax_minor)::bigint as net_sales,
           sum(o.tax_minor)::bigint as tax,
           sum(o.total_minor)::bigint as total,
           count(*) as n
    from public.orders o
    where o.tenant_id = v_tenant
      and o.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
      and o.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
      and o.order_status not in ('rejected', 'cancelled')
      and o.payment_status in ('paid', 'cash_received', 'reconciled')
    group by 1 order by 1
  loop
    v_entries := '';
    v_debits := 0;

    for m in
      select case
               when p.method in ('cash') then p_cash_ledger
               when p.method in ('upi') then p_upi_ledger
               when p.method in ('card') then p_card_ledger
               when p.method = 'credit' then p_account_ledger
               else p_upi_ledger   -- online gateway payments land with the UPI/online receipts
             end as ledger,
             sum(p.amount_minor)::bigint as amt
      from public.payments p
      join public.orders o on o.id = p.order_id
      where o.tenant_id = v_tenant
        and (o.created_at at time zone 'Asia/Kolkata')::date = d.day
        and o.order_status not in ('rejected', 'cancelled')
        and o.payment_status in ('paid', 'cash_received', 'reconciled')
        and p.status in ('paid', 'cash_received', 'reconciled')
      group by 1
    loop
      v_entries := v_entries || format(
        '<ALLLEDGERENTRIES.LIST><LEDGERNAME>%s</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-%s</AMOUNT></ALLLEDGERENTRIES.LIST>',
        public.xml_escape(m.ledger), to_char(m.amt / 100.0, 'FM999999990.00'));
      v_debits := v_debits + m.amt;
    end loop;

    v_cgst := floor(d.tax / 2.0);
    v_sgst := d.tax - v_cgst;
    v_credits := d.net_sales + d.tax;
    v_diff := v_debits - v_credits;   -- >0: collected more than invoiced

    v_entries := v_entries || format(
      '<ALLLEDGERENTRIES.LIST><LEDGERNAME>%s</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>%s</AMOUNT></ALLLEDGERENTRIES.LIST>',
      public.xml_escape(p_sales_ledger), to_char(d.net_sales / 100.0, 'FM999999990.00'));
    if d.tax > 0 then
      v_entries := v_entries || format(
        '<ALLLEDGERENTRIES.LIST><LEDGERNAME>%s</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>%s</AMOUNT></ALLLEDGERENTRIES.LIST>',
        public.xml_escape(p_cgst_ledger), to_char(v_cgst / 100.0, 'FM999999990.00'))
        || format(
        '<ALLLEDGERENTRIES.LIST><LEDGERNAME>%s</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>%s</AMOUNT></ALLLEDGERENTRIES.LIST>',
        public.xml_escape(p_sgst_ledger), to_char(v_sgst / 100.0, 'FM999999990.00'));
    end if;
    if v_diff <> 0 then
      -- Keep the voucher balanced: a credit when more was collected than invoiced, a debit otherwise.
      v_entries := v_entries || format(
        '<ALLLEDGERENTRIES.LIST><LEDGERNAME>%s</LEDGERNAME><ISDEEMEDPOSITIVE>%s</ISDEEMEDPOSITIVE><AMOUNT>%s%s</AMOUNT></ALLLEDGERENTRIES.LIST>',
        public.xml_escape(p_roundoff_ledger), case when v_diff > 0 then 'No' else 'Yes' end,
        case when v_diff > 0 then '' else '-' end, to_char(abs(v_diff) / 100.0, 'FM999999990.00'));
    end if;

    v_vouchers := v_vouchers || format(
      '<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View"><DATE>%s</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>%s</VOUCHERNUMBER><NARRATION>%s</NARRATION><PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>%s</VOUCHER></TALLYMESSAGE>',
      to_char(d.day, 'YYYYMMDD'), 'BR-' || to_char(d.day, 'YYMMDD'),
      public.xml_escape(d.n || ' orders on ' || to_char(d.day, 'DD-Mon-YYYY') || ' (BlinkRest)'), v_entries);
  end loop;

  v_out := '<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>'
    || public.xml_escape(v_company) || '</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>' || v_vouchers
    || '</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>';
  return v_out;
end;
$$;

revoke execute on function public.export_gst_register_csv(date, date) from public, anon;
revoke execute on function public.export_tally_xml(date, date, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.export_gst_register_csv(date, date) to authenticated;
grant execute on function public.export_tally_xml(date, date, text, text, text, text, text, text, text, text) to authenticated;

-- Reservations: seat a booking or waiting party at a table; opens the table.
create or replace function public.seat_reservation(p_id uuid, p_table uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('tables.assign') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.restaurant_tables where id = p_table and tenant_id = public.current_tenant_id()) then
    raise exception 'table_not_found' using errcode = 'P0001';
  end if;
  update public.reservations set status = 'seated', table_id = p_table
  where id = p_id and tenant_id = public.current_tenant_id() and status in ('booked', 'waiting');
  if not found then
    raise exception 'reservation_not_open' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.seat_reservation(uuid, uuid) from public, anon;
grant execute on function public.seat_reservation(uuid, uuid) to authenticated;
