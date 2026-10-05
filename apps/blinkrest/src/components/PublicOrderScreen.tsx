import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, SlideInDown, SlideInRight, SlideOutDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { openRazorpayCheckout } from '@/lib/razorpay';
import { deriveBrandPalette } from '@/lib/brandColor';
import { menuImageUrl } from '@/lib/menuImage';
import { MenuItemSkeleton } from '@/components/Skeleton';
import { TextField } from '@/components/TextField';
import { useIsOnline } from '@/hooks/useIsOnline';
import { guardOnline } from '@/lib/offline';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius, shadow } from '@/theme/tokens';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const LOAD_TIMEOUT_MS = 12000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// Keeps the guest on the live tracking screen across an accidental refresh
// or tab close — a table's QR token is the natural scope for "this guest's
// current order" since there's no customer account to key it off.
function confirmationStorageKey(token: string) {
  return `order-confirmation:${token}`;
}

async function callFn<T>(name: string, body: object): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error ?? 'request_failed'), { code: data.error });
  return data;
}

type MenuItem = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_minor: number;
  currency: string;
  is_available: boolean;
  image_path: string | null;
  dietary_labels: string[];
};

type Category = { id: string; name: string; sort_order: number };

type Rating = { avg: number; count: number };

type TableInfo = {
  tenant: { id: string; name: string; gst_percent: number; logo_path?: string | null; cover_image_path?: string | null; brand_colors?: { primary?: string } | null; settings?: { accepting_orders?: boolean; cuisine?: string; open_time?: string; close_time?: string } };
  table: { id: string; label: string };
  rating: Rating | null;
};

type CartLine = { item: MenuItem; quantity: number };

type Quote = { subtotal_minor: number; discount_minor: number; gst_minor: number; total_minor: number };

type Confirmation = {
  order_id: string;
  order_number: string;
  order_status: string;
  payment_status: 'paid' | 'unpaid';
  subtotal_minor: number;
  discount_minor: number;
  gst_minor: number;
  total_minor: number;
};

const OFFER_ERRORS: Record<string, string> = {
  invalid_offer_code: "That code isn't valid.",
  offer_not_started: "That code isn't active yet.",
  offer_expired: 'That code has expired.',
  offer_not_available_today: "That code isn't valid today.",
  offer_usage_limit_reached: 'That code has reached its usage limit.',
  offer_already_used: "You've already used that code.",
  order_below_minimum: 'Add a bit more to your order for this code to apply.',
};

const TRACKING_STEPS: { status: string; label: string }[] = [
  { status: 'new', label: 'Order received' },
  { status: 'accepted', label: 'Accepted by the kitchen' },
  { status: 'preparing', label: 'Being prepared' },
  { status: 'ready', label: 'Ready' },
  { status: 'served', label: 'Served at your table' },
];

// The actual ordering experience behind a table's QR code. Takes the secret
// token directly — callers (the /order/[token] and /r/[slug]/[table] routes)
// are just different URL shapes that resolve to the same real token. Staff
// previewing their own live menu (no real table/token involved) instead pass
// `previewTenantId`, which skips the token resolution and loads the same
// real menu data straight from the tenant id already known from their
// session — same screen, same data, checkout just can't submit a real order.
export function PublicOrderScreen({ token, previewTenantId, onBack }: { token?: string; previewTenantId?: string; onBack?: () => void }) {
  const isPreview = !!previewTenantId;
  const insets = useSafeAreaInsets();
  const isOnline = useIsOnline();
  const [info, setInfo] = useState<TableInfo | null>(null);
  const brand = useMemo(() => deriveBrandPalette(info?.tenant.brand_colors?.primary), [info]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [offerCode, setOfferCode] = useState('');
  const [offerError, setOfferError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'counter'>('online');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [placing, setPlacing] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [livePaymentStatus, setLivePaymentStatus] = useState<'paid' | 'unpaid' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [foodRating, setFoodRating] = useState(0);
  const [serviceRating, setServiceRating] = useState(0);
  const [speedRating, setSpeedRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [callingWaiter, setCallingWaiter] = useState(false);
  const [waiterCalled, setWaiterCalled] = useState(false);

  const [attempt, setAttempt] = useState(0);

  // Restore an in-progress order on mount so refreshing the browser (or
  // reopening the tab) lands back on the tracking screen instead of a blank
  // menu — the guest never has to re-scan the QR code just to keep watching
  // their order's status.
  useEffect(() => {
    if (isPreview || !token) return;
    let cancelled = false;
    AsyncStorage.getItem(confirmationStorageKey(token)).then((raw) => {
      if (cancelled || !raw) return;
      try {
        setConfirmation(JSON.parse(raw));
      } catch {
        // ignore corrupt storage
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token, isPreview]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!token && !previewTenantId) {
        setError('This QR code is missing its access key.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        let data: TableInfo;
        if (previewTenantId) {
          const [{ data: tenant, error: tenantError }, { data: reviews }] = await withTimeout(
            Promise.all([
              Promise.resolve(supabase.from('tenants').select('id, name, settings, gst_percent, logo_path, cover_image_path, brand_colors').eq('id', previewTenantId).single()),
              Promise.resolve(supabase.from('reviews').select('rating').eq('tenant_id', previewTenantId)),
            ]),
            LOAD_TIMEOUT_MS,
          );
          if (tenantError || !tenant) throw new Error('Could not load your restaurant.');
          const reviewRows = reviews ?? [];
          data = {
            tenant,
            table: { id: '', label: 'Menu preview' },
            rating: reviewRows.length > 0 ? { avg: reviewRows.reduce((s, r) => s + r.rating, 0) / reviewRows.length, count: reviewRows.length } : null,
          };
        } else {
          const res = await withTimeout(
            fetch(`${SUPABASE_URL}/functions/v1/resolve-table`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
              body: JSON.stringify({ token }),
            }),
            LOAD_TIMEOUT_MS,
          );
          if (!res.ok) throw new Error('This table link is invalid or has expired.');
          data = await res.json();
        }
        if (cancelled) return;
        setInfo(data);

        const [{ data: cats }, { data: menuItems }] = await withTimeout(
          Promise.all([
            supabase.from('menu_categories').select('id, name, sort_order').eq('tenant_id', data.tenant.id).eq('is_active', true).order('sort_order'),
            supabase.from('menu_items').select('id, category_id, name, description, price_minor, currency, is_available, image_path, dietary_labels').eq('tenant_id', data.tenant.id).eq('is_available', true).order('sort_order'),
          ]),
          LOAD_TIMEOUT_MS,
        );
        if (cancelled) return;
        setCategories(cats ?? []);
        setItems((menuItems as any) ?? []);
      } catch (e) {
        if (cancelled) return;
        const timedOut = e instanceof Error && e.message === 'timeout';
        setError(
          timedOut
            ? "This is taking longer than it should. Check your connection and try again — if it keeps happening, ask staff for a fresh QR code."
            : e instanceof Error
              ? e.message
              : 'Could not load the menu.',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token, previewTenantId, attempt]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesCategory = activeCategory === 'All' || item.category_id === activeCategory;
      const matchesQuery = !q || item.name.toLowerCase().includes(q);
      const matchesVeg = !vegOnly || item.dietary_labels.includes('veg');
      return matchesCategory && matchesQuery && matchesVeg;
    });
  }, [items, activeCategory, query, vegOnly]);

  const acceptingOrders = info?.tenant.settings?.accepting_orders !== false;
  const cartLines = Object.values(cart);
  const cartTotal = cartLines.reduce((sum, l) => sum + l.item.price_minor * l.quantity, 0);
  const cartCount = cartLines.reduce((sum, l) => sum + l.quantity, 0);

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev[item.id];
      return { ...prev, [item.id]: { item, quantity: (existing?.quantity ?? 0) + 1 } };
    });
  }

  function removeFromCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev[item.id];
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        const { [item.id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [item.id]: { ...existing, quantity: existing.quantity - 1 } };
    });
  }

  // Live bill breakdown (subtotal/discount/GST/total) as the cart or promo
  // code changes, straight from the same pricing logic the order will
  // actually be priced with — never recomputed by hand on the client.
  useEffect(() => {
    if (!checkoutOpen || isPreview || !info) return;
    if (cartLines.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting derived state when the cart empties
      setQuote(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const q = await callFn<Quote>('quote-order', {
          token,
          items: cartLines.map((l) => ({ menu_item_id: l.item.id, variant_ids: [], addon_ids: [], quantity: l.quantity })),
          offerCode: offerCode.trim() || null,
        });
        if (!cancelled) {
          setQuote(q);
          setOfferError(null);
        }
      } catch (e: any) {
        if (cancelled) return;
        const friendly = OFFER_ERRORS[e.code];
        if (friendly && offerCode.trim()) setOfferError(friendly);
        // Re-quote without the code so the bill still shows something sane.
        try {
          const q = await callFn<Quote>('quote-order', {
            token,
            items: cartLines.map((l) => ({ menu_item_id: l.item.id, variant_ids: [], addon_ids: [], quantity: l.quantity })),
            offerCode: null,
          });
          if (!cancelled) setQuote(q);
        } catch {
          // ignore — bill just won't update this round
        }
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cartTotal stands in for cartLines identity
  }, [checkoutOpen, isPreview, info, cartTotal, offerCode, token]);

  const previewQuote: Quote | null = useMemo(() => {
    if (!isPreview || !info || cartLines.length === 0) return null;
    const gst = Math.round(cartTotal * (info.tenant.gst_percent / 100));
    return { subtotal_minor: cartTotal, discount_minor: 0, gst_minor: gst, total_minor: cartTotal + gst };
  }, [isPreview, info, cartTotal, cartLines.length]);

  const bill = isPreview ? previewQuote : quote;

  // Live order tracking once an order exists — the kitchen's own status
  // transitions (accept/prepare/ready/served) and payment updates stream
  // straight to the customer, not a fake canned sequence. `anon` can't read
  // public.orders directly (see 0046_public_order_tracking.sql), so this
  // polls a narrow SECURITY DEFINER lookup instead of subscribing to
  // postgres_changes.
  useEffect(() => {
    if (!confirmation) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seeding live status from the just-placed order
    setLiveStatus(confirmation.order_status);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seeding live payment status from the just-placed order
    setLivePaymentStatus(confirmation.payment_status);
    async function poll() {
      try {
        const { data } = await supabase.rpc('get_order_tracking', { p_order_id: confirmation!.order_id });
        if (!cancelled && data) {
          setLiveStatus(data.order_status);
          setLivePaymentStatus(data.payment_status);
        }
      } catch {
        // ignore — next tick retries
      }
    }
    const interval = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [confirmation]);

  async function finalizeOrder(payment?: { razorpayPaymentId: string; razorpayOrderId: string; razorpaySignature: string }) {
    const data = await callFn<Confirmation>('create-order', {
      token,
      items: cartLines.map((l) => ({ menu_item_id: l.item.id, variant_ids: [], addon_ids: [], quantity: l.quantity })),
      customer: { name: customerName.trim(), phone: customerPhone.trim() },
      offerCode: offerCode.trim() || null,
      specialInstructions: specialInstructions.trim() || null,
      razorpayPaymentId: payment?.razorpayPaymentId,
      razorpayOrderId: payment?.razorpayOrderId,
      razorpaySignature: payment?.razorpaySignature,
    });
    setConfirmation(data);
    if (!isPreview && token) {
      AsyncStorage.setItem(confirmationStorageKey(token), JSON.stringify(data)).catch(() => {});
    }
    setCart({});
    setCheckoutOpen(false);
    setOfferCode('');
  }

  async function placeOrder() {
    if (!info) return;
    if (!guardOnline(isOnline)) return;
    if (isPreview) {
      Alert.alert('This is a preview', "Checkout is disabled here so you don't create a real order. Customers get the full checkout when they scan a table's QR code.");
      return;
    }
    const digitsOnly = customerPhone.replace(/\D/g, '');
    if (!customerName.trim()) {
      setDetailsError('Enter your name.');
      return;
    }
    if (digitsOnly.length < 10) {
      setDetailsError('Enter a valid mobile number.');
      return;
    }
    setDetailsError(null);
    setPlacing(true);
    setOfferError(null);
    try {
      if (paymentMethod === 'counter') {
        await finalizeOrder();
        return;
      }

      const rp = await callFn<{ razorpayOrderId: string; amountMinor: number; currency: string; keyId: string }>('create-razorpay-order', {
        token,
        items: cartLines.map((l) => ({ menu_item_id: l.item.id, variant_ids: [], addon_ids: [], quantity: l.quantity })),
        offerCode: offerCode.trim() || null,
      });

      const result = await openRazorpayCheckout({
        keyId: rp.keyId,
        amountMinor: rp.amountMinor,
        currency: rp.currency,
        razorpayOrderId: rp.razorpayOrderId,
        name: info.tenant.name,
        description: `Order · ${info.table.label}`,
        prefill: { name: customerName.trim() || undefined, contact: customerPhone.trim() || undefined },
      });

      await finalizeOrder({ razorpayPaymentId: result.razorpay_payment_id, razorpayOrderId: result.razorpay_order_id, razorpaySignature: result.razorpay_signature });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Please try again.';
      if (message !== 'cancelled') {
        const friendly = OFFER_ERRORS[(e as any)?.code];
        if (friendly) setOfferError(friendly);
        else Alert.alert('Order failed', message);
      }
    } finally {
      setPlacing(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, gap: 10 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <MenuItemSkeleton key={i} />
        ))}
      </View>
    );
  }

  if (error || !info) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
        <Text style={{ fontFamily: fonts.bodyBold, color: colors.error, textAlign: 'center' }}>
          {error ?? 'This table link is invalid.'}
        </Text>
        <Button title="Try again" onPress={() => setAttempt((a) => a + 1)} />
      </View>
    );
  }

  async function callWaiter() {
    if (isPreview || callingWaiter || waiterCalled) return;
    if (!guardOnline(isOnline)) return;
    setCallingWaiter(true);
    try {
      await callFn('call-waiter', { token });
      setWaiterCalled(true);
    } catch {
      Alert.alert('Could not reach staff', 'Please try again in a moment.');
    } finally {
      setCallingWaiter(false);
    }
  }

  async function submitReview() {
    if (!confirmation || rating === 0) return;
    if (!guardOnline(isOnline)) return;
    setSubmittingReview(true);
    const { error: reviewError } = await supabase.rpc('submit_review', {
      p_order_id: confirmation.order_id,
      p_rating: rating,
      p_comment: reviewComment.trim() || null,
      p_customer_name: customerName.trim() || null,
      p_food_rating: foodRating || null,
      p_service_rating: serviceRating || null,
      p_speed_rating: speedRating || null,
    });
    setSubmittingReview(false);
    if (reviewError) {
      Alert.alert('Could not send your rating', reviewError.message);
      return;
    }
    setReviewSubmitted(true);
  }

  if (confirmation) {
    const stepIndex = Math.max(0, TRACKING_STEPS.findIndex((s) => s.status === liveStatus));
    const isServed = liveStatus === 'served';
    const isPaid = (livePaymentStatus ?? confirmation.payment_status) === 'paid';

    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: 32 }}>
        {isPaid ? (
          <Animated.View entering={FadeInDown} style={{ backgroundColor: colors.success, paddingTop: Math.max(insets.top + 32, 52), paddingBottom: 28, paddingHorizontal: 24, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, alignItems: 'center', gap: 8 }}>
            <Animated.View entering={ZoomIn.springify().damping(12)} style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={36} stroke={3} color={colors.success} />
            </Animated.View>
            <Text style={{ fontSize: 26, fontFamily: fonts.display, color: '#FFFFFF', textAlign: 'center' }}>Payment successful</Text>
            <Text style={{ fontSize: 15, color: '#FFFFFF', textAlign: 'center' }}>{formatMinor(confirmation.total_minor)} paid online</Text>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInDown} style={{ paddingTop: Math.max(insets.top + 24, 44), paddingHorizontal: 24, paddingBottom: 8, alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900, textAlign: 'center' }}>Order placed!</Text>
            <Text style={{ fontSize: 14, color: colors.ink700, textAlign: 'center' }}>A waiter will bring your bill for {formatMinor(confirmation.total_minor)} to the table.</Text>
          </Animated.View>
        )}

        <View style={{ padding: 20, gap: 14 }}>
          <View style={{ backgroundColor: colors.saffron50, borderRadius: radius.lg, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="info" size={16} stroke={2.2} color="#8A5A00" />
            <Text style={{ fontSize: 12.5, fontFamily: fonts.bodyBold, color: '#8A5A00', flex: 1 }}>
              Don&rsquo;t close this page — keep it open for live order tracking.
            </Text>
          </View>

          {!isPaid ? (
            <View style={{ backgroundColor: colors.ink900, borderRadius: 28, padding: 20, alignItems: 'center', gap: 10 }}>
              <View style={{ height: 26, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.saffron400, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Icon name="bell" size={13} stroke={2.3} color={colors.ink900} />
                <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: colors.ink900, letterSpacing: 0.5 }}>CALL WAITER FOR BILL</Text>
              </View>
              <Text style={{ fontSize: 48, fontFamily: fonts.display, color: '#FFFFFF' }}>#{confirmation.order_number}</Text>
              <Text style={{ fontSize: 14, color: '#E9E1DC' }}>{info.table.label} · {formatMinor(confirmation.total_minor)} to pay</Text>
            </View>
          ) : null}

          {!isPaid && !waiterCalled ? (
            <Button
              title={callingWaiter ? 'Calling…' : "Call waiter for bill"}
              onPress={callWaiter}
              loading={callingWaiter}
            />
          ) : !isPaid && waiterCalled ? (
            <Animated.View entering={FadeInDown} style={{ borderRadius: radius.lg, backgroundColor: colors.successBg, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name="checkc" size={22} color={colors.success} />
              <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.success, flex: 1 }}>Noted — a waiter is on the way with your bill.</Text>
            </Animated.View>
          ) : null}

          <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 14 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.ink900 }}>Order #{confirmation.order_number}</Text>
            {TRACKING_STEPS.map((s, i) => {
              const active = i === stepIndex;
              const reached = i <= stepIndex;
              return (
                <View key={s.status} style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ alignItems: 'center', width: 24 }}>
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: reached ? colors.success : '#FFFFFF', borderWidth: reached ? 0 : 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
                      {reached ? <Icon name="check" size={13} stroke={3} color="#FFFFFF" /> : null}
                    </View>
                    {i < TRACKING_STEPS.length - 1 ? <View style={{ width: 2, flex: 1, minHeight: 16, backgroundColor: colors.line }} /> : null}
                  </View>
                  <Text style={{ fontSize: 14, fontFamily: reached ? fonts.bodyExtraBold : fonts.body, color: reached ? colors.ink900 : colors.ink500, paddingBottom: 14 }}>
                    {s.label}{active ? ' · now' : ''}
                  </Text>
                </View>
              );
            })}
          </View>

          {!isServed && !isPreview && info.table.id ? (
            <Pressable
              onPress={callWaiter}
              disabled={callingWaiter || waiterCalled}
              style={{ height: 52, borderRadius: radius.pill, borderWidth: 1.5, borderColor: waiterCalled ? '#8FD3AE' : colors.inputBorder, backgroundColor: waiterCalled ? colors.successBg : colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <Icon name="bell" size={18} color={waiterCalled ? colors.success : colors.ink900} />
              <Text style={{ fontFamily: fonts.bodyExtraBold, color: waiterCalled ? colors.success : colors.ink900, fontSize: 15 }}>
                {waiterCalled ? 'Waiter notified' : callingWaiter ? 'Calling…' : 'Call waiter'}
              </Text>
            </Pressable>
          ) : null}

          {isServed && !reviewSubmitted ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 12 }}>
              <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900, textAlign: 'center' }}>How was your experience?</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} onPress={() => setRating(n)} hitSlop={6}>
                    <Text style={{ fontSize: 32, color: n <= rating ? colors.saffron400 : colors.line }}>★</Text>
                  </Pressable>
                ))}
              </View>
              {rating > 0 ? (
                <>
                  {([
                    ['Food', foodRating, setFoodRating],
                    ['Service', serviceRating, setServiceRating],
                    ['Speed', speedRating, setSpeedRating],
                  ] as const).map(([label, value, setValue]) => (
                    <View key={label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink700 }}>{label}</Text>
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Pressable key={n} onPress={() => setValue(n)} hitSlop={4}>
                            <Text style={{ fontSize: 18, color: n <= value ? colors.saffron400 : colors.line }}>★</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ))}
                  <TextField label="Add a comment (optional)" value={reviewComment} onChangeText={setReviewComment} placeholder="Tell us more" />
                  <Button title={submittingReview ? 'Sending…' : 'Send rating'} onPress={submitReview} loading={submittingReview} />
                </>
              ) : null}
            </View>
          ) : isServed && reviewSubmitted ? (
            <Text style={{ fontFamily: fonts.bodyBold, color: colors.success, textAlign: 'center' }}>Thanks for your feedback!</Text>
          ) : null}

          <Pressable
            onPress={() => {
              if (token) AsyncStorage.removeItem(confirmationStorageKey(token)).catch(() => {});
              setConfirmation(null);
            }}
            style={{ height: 54, borderRadius: radius.pill, backgroundColor: colors.ink900, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontFamily: fonts.bodyExtraBold, fontSize: 16 }}>Order more</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  if (checkoutOpen) {
    const subtotal = bill?.subtotal_minor ?? cartTotal;
    const discount = bill?.discount_minor ?? 0;
    const gst = bill?.gst_minor ?? 0;
    const total = bill?.total_minor ?? subtotal + gst;
    const codeApplied = offerCode.trim().length > 0 && discount > 0 && !offerError;

    return (
      <Animated.View entering={SlideInRight.duration(220)} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: Math.max(insets.top + 12, 20), gap: 14, paddingBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable onPress={() => setCheckoutOpen(false)} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="left" size={20} stroke={2.2} color={colors.ink900} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>Your order</Text>
              <Text style={{ fontSize: 12, color: colors.ink500 }}>{info.tenant.name} · {info.table.label}</Text>
            </View>
          </View>

          <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 14 }}>
            {cartLines.map((l) => (
              <View key={l.item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {l.item.image_path ? (
                  <Image source={{ uri: menuImageUrl(l.item.image_path) ?? undefined }} style={{ width: 52, height: 52, borderRadius: 14 }} resizeMode="cover" />
                ) : (
                  <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: brand.tint, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="flame" size={20} color={brand.dark} />
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }} numberOfLines={1}>{l.item.name}</Text>
                  <Text style={{ fontSize: 13, color: colors.ink500 }}>{formatMinor(l.item.price_minor, l.item.currency)} each</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#8FD3AE', borderRadius: 12, backgroundColor: '#F3FBF6' }}>
                  <Pressable onPress={() => removeFromCart(l.item)} style={{ width: 36, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="minus" size={16} stroke={2.6} color={colors.success} />
                  </Pressable>
                  <Text style={{ minWidth: 18, textAlign: 'center', fontFamily: fonts.bodyExtraBold, color: colors.success }}>{l.quantity}</Text>
                  <Pressable onPress={() => addToCart(l.item)} style={{ width: 36, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="plus" size={16} stroke={2.6} color={colors.success} />
                  </Pressable>
                </View>
                <Text style={{ width: 58, textAlign: 'right', fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>
                  {formatMinor(l.item.price_minor * l.quantity, l.item.currency)}
                </Text>
              </View>
            ))}
            <Pressable onPress={() => setCheckoutOpen(false)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="plus" size={15} stroke={2.4} color={brand.dark} />
              <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: brand.dark }}>Add more items</Text>
            </Pressable>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>Cooking instructions</Text>
              <TextInput
                value={specialInstructions}
                onChangeText={setSpecialInstructions}
                placeholder="e.g. Less spicy please"
                multiline
                numberOfLines={2}
                style={{ borderRadius: 14, borderWidth: 1.5, borderColor: colors.inputBorder, padding: 12, fontSize: 15, backgroundColor: '#FFFFFF', color: colors.ink900, minHeight: 56, textAlignVertical: 'top' }}
              />
            </View>
          </View>

          <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 17, fontFamily: fonts.display, color: colors.ink900 }}>Your details</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Name"
                  value={customerName}
                  onChangeText={(v) => {
                    setCustomerName(v);
                    setDetailsError(null);
                  }}
                  placeholder="Riya"
                  autoCapitalize="words"
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Mobile"
                  value={customerPhone}
                  onChangeText={(v) => {
                    setCustomerPhone(v);
                    setDetailsError(null);
                  }}
                  placeholder="98XXXXXXXX"
                  keyboardType="phone-pad"
                />
              </View>
            </View>
            {detailsError ? (
              <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.error }}>{detailsError}</Text>
            ) : (
              <Text style={{ fontSize: 12, color: colors.ink500 }}>Required for order updates and your receipt.</Text>
            )}
          </View>

          <View style={{ gap: 8 }}>
            <TextField
              label="Promo code (optional)"
              value={offerCode}
              onChangeText={(v) => {
                setOfferCode(v);
                setOfferError(null);
              }}
              placeholder="e.g. TADKA10"
              autoCapitalize="characters"
              error={offerError ?? undefined}
            />
            {codeApplied ? (
              <Animated.View entering={FadeInDown} style={{ borderRadius: radius.md, backgroundColor: colors.successBg, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="tag" size={18} stroke={2.2} color={colors.success} />
                <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.success }}>{offerCode.trim().toUpperCase()} applied — you save {formatMinor(discount)}</Text>
              </Animated.View>
            ) : null}
          </View>

          <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 10 }}>
            <Text style={{ fontSize: 17, fontFamily: fonts.display, color: colors.ink900 }}>Bill details</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, color: colors.ink700 }}>Item total</Text>
              <Text style={{ fontSize: 14, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{formatMinor(subtotal)}</Text>
            </View>
            {discount > 0 ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, color: colors.success }}>Discount</Text>
                <Text style={{ fontSize: 14, fontFamily: fonts.bodyBold, color: colors.success }}>−{formatMinor(discount)}</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, color: colors.ink700 }}>GST {info.tenant.gst_percent}%</Text>
              <Text style={{ fontSize: 14, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{formatMinor(gst)}</Text>
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: colors.line, borderStyle: 'dashed', paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>To pay</Text>
              <Text style={{ fontSize: 24, fontFamily: fonts.display, color: colors.ink900 }}>{formatMinor(total)}</Text>
            </View>
          </View>

          {acceptingOrders ? (
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900, marginHorizontal: 4 }}>How would you like to pay?</Text>
              {([
                { key: 'online' as const, title: 'Pay online now', sub: 'UPI, cards, netbanking & wallets', icon: 'qr' as const, note: 'Secured by Razorpay · order goes to the kitchen once paid', noteIcon: 'shield' as const, tileBg: brand.tint, tileFg: brand.dark },
                { key: 'counter' as const, title: "I'll call waiter for bill", sub: 'Pay cash or UPI at the table when it arrives', icon: 'bell' as const, note: 'Order goes to the kitchen right away', noteIcon: 'flame' as const, tileBg: colors.saffron50, tileFg: '#8A5A00' },
              ]).map((o) => {
                const on = paymentMethod === o.key;
                return (
                  <Pressable
                    key={o.key}
                    onPress={() => setPaymentMethod(o.key)}
                    style={{ borderRadius: radius.lg, borderWidth: on ? 2 : 1.5, borderColor: on ? colors.ink900 : colors.inputBorder, backgroundColor: on ? '#FFFFFF' : colors.surface, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'flex-start', ...(on ? shadow.card : {}) }}
                  >
                    <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: o.tileBg, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={o.icon} size={21} stroke={2.1} color={o.tileFg} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{o.title}</Text>
                      <Text style={{ fontSize: 13, color: colors.ink700 }}>{o.sub}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Icon name={o.noteIcon} size={13} stroke={2.3} color={o.key === 'online' ? colors.success : '#8A5A00'} />
                        <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: o.key === 'online' ? colors.success : '#8A5A00' }}>{o.note}</Text>
                      </View>
                    </View>
                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: on ? 7 : 2, borderColor: on ? brand.dark : colors.line, marginTop: 8 }} />
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={{ backgroundColor: colors.errorBg, borderRadius: radius.lg, padding: 16 }}>
              <Text style={{ fontFamily: fonts.bodyBold, color: colors.error, textAlign: 'center' }}>
                The kitchen is busy and isn&rsquo;t accepting new orders right now. Please check back shortly.
              </Text>
            </View>
          )}
        </ScrollView>

        {acceptingOrders ? (
          <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, padding: 16, paddingBottom: 24, gap: 6 }}>
            <Button
              title={isPreview ? 'Place order (preview only)' : placing ? 'Please wait…' : paymentMethod === 'online' ? `Pay securely · ${formatMinor(total)}` : `Place order · ${formatMinor(total)}`}
              onPress={placeOrder}
              loading={placing}
              disabled={!isPreview && (!customerName.trim() || customerPhone.replace(/\D/g, '').length < 10)}
            />
            <Text style={{ textAlign: 'center', fontSize: 12, color: colors.ink500 }}>
              {paymentMethod === 'online' ? "Razorpay's secure checkout opens next" : "A waiter will bring your bill to the table"}
            </Text>
          </View>
        ) : null}
      </Animated.View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ backgroundColor: brand.primary, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden' }}>
        {info.tenant.cover_image_path ? (
          <>
            <View style={{ height: insets.top, backgroundColor: brand.primary }} />
            <Image source={{ uri: menuImageUrl(info.tenant.cover_image_path) ?? undefined }} style={{ width: '100%', height: 140 }} resizeMode="cover" />
          </>
        ) : null}
        <View style={{ padding: 20, paddingTop: info.tenant.cover_image_path ? 16 : Math.max(insets.top + 8, 20), paddingBottom: 22, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {onBack ? (
              <Pressable onPress={onBack} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="left" size={18} stroke={2.2} color={colors.ink900} />
              </Pressable>
            ) : null}
            <View style={{ height: 30, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.ink900, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="dine" size={15} color="#FFFFFF" />
              <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>{info.table.label}</Text>
            </View>
            {isPreview ? (
              <View style={{ height: 28, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center' }}>
                <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: colors.ink900, letterSpacing: 0.5 }}>PREVIEW</Text>
              </View>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {info.tenant.logo_path ? (
              <Image source={{ uri: menuImageUrl(info.tenant.logo_path) ?? undefined }} style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF' }} resizeMode="cover" />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 30, fontFamily: fonts.display, color: brand.onPrimary }}>{info.tenant.name}</Text>
              {info.tenant.settings?.cuisine ? (
                <Text style={{ fontSize: 13, fontFamily: fonts.bodySemi, color: brand.onPrimary }}>{info.tenant.settings.cuisine}</Text>
              ) : null}
            </View>
          </View>

          {info.rating || (info.tenant.settings?.open_time && info.tenant.settings?.close_time) ? (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {info.rating ? (
                <>
                  <View style={{ height: 28, paddingHorizontal: 9, borderRadius: 10, backgroundColor: colors.success, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Icon name="star" size={13} color="#FFFFFF" />
                    <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>{info.rating.avg.toFixed(1)}</Text>
                  </View>
                  <View style={{ height: 28, paddingHorizontal: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{info.rating.count} rating{info.rating.count > 1 ? 's' : ''}</Text>
                  </View>
                </>
              ) : null}
              {info.tenant.settings?.open_time && info.tenant.settings?.close_time ? (
                <View style={{ height: 28, paddingHorizontal: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink900 }}>Open {info.tenant.settings.open_time} – {info.tenant.settings.close_time}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {!acceptingOrders ? (
            <View style={{ backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: radius.md, padding: 10, marginTop: 4 }}>
              <Text style={{ fontFamily: fonts.bodyBold, color: colors.error, textAlign: 'center', fontSize: 13 }}>
                Kitchen is busy — not accepting new orders right now. You can still browse the menu.
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: cartCount > 0 ? 110 : 24, gap: 14 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, height: 50, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }}>
            <Icon name="search" size={19} color={colors.ink500} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search for dishes"
              placeholderTextColor={colors.ink500}
              style={{ flex: 1, fontSize: 15, color: colors.ink900, fontFamily: fonts.body }}
            />
          </View>
          <Pressable
            onPress={() => setVegOnly((v) => !v)}
            style={{ height: 50, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1.5, borderColor: vegOnly ? '#0E8F4A' : colors.line, backgroundColor: vegOnly ? '#EAF7EE' : colors.surface, flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <View style={{ width: 14, height: 14, borderWidth: 1.6, borderColor: '#0E8F4A', borderRadius: 3, alignItems: 'center', justifyContent: 'center' }}>
              {vegOnly ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#0E8F4A' }} /> : null}
            </View>
            <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Veg only</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {['All', ...categories.map((c) => c.id)].map((id) => {
            const active = activeCategory === id;
            const label = id === 'All' ? 'All' : categories.find((c) => c.id === id)?.name ?? '';
            return (
              <Pressable
                key={id}
                onPress={() => setActiveCategory(id)}
                style={{ height: 40, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: active ? colors.ink900 : colors.surface, borderWidth: active ? 0 : 1.5, borderColor: colors.inputBorder, justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 14, fontFamily: active ? fonts.bodyExtraBold : fonts.bodyBold, color: active ? '#FFFFFF' : colors.ink900 }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {visibleItems.length === 0 ? (
          <Animated.View entering={FadeInDown} style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 8 }}>
            <Text style={{ fontSize: 18, fontFamily: fonts.bodyExtraBold, color: colors.ink900, textAlign: 'center' }}>
              {items.length === 0 ? "The menu isn't ready yet" : 'No dishes match'}
            </Text>
            <Text style={{ fontSize: 14, color: colors.ink500, textAlign: 'center', maxWidth: 280 }}>
              {items.length === 0
                ? `${info.tenant.name} hasn't added any dishes here yet. Please check with staff at your table.`
                : 'Try a different search or category.'}
            </Text>
          </Animated.View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            {visibleItems.map((item, index) => {
              const qty = cart[item.id]?.quantity ?? 0;
              const isVeg = item.dietary_labels.includes('veg');
              return (
                <Animated.View key={item.id} entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(260)} style={{ width: '47%', gap: 8 }}>
                  <View style={{ paddingBottom: 16 }}>
                    <View>
                      {item.image_path ? (
                        <Image source={{ uri: menuImageUrl(item.image_path) ?? undefined }} style={{ width: '100%', aspectRatio: 1, borderRadius: 22, backgroundColor: brand.tint }} resizeMode="cover" />
                      ) : (
                        <View style={{ width: '100%', aspectRatio: 1, borderRadius: 22, backgroundColor: brand.tint, alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="flame" size={32} color={brand.dark} />
                        </View>
                      )}
                      {qty === 0 ? (
                        <Pressable
                          onPress={() => addToCart(item)}
                          style={{ position: 'absolute', left: 24, right: 24, bottom: -16, height: 40, borderRadius: 12, borderWidth: 1.5, borderColor: '#F4C7C1', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', ...shadow.card }}
                        >
                          <Text style={{ fontFamily: fonts.bodyExtraBold, color: brand.darker, fontSize: 15 }}>ADD</Text>
                        </Pressable>
                      ) : (
                        <Animated.View
                          entering={ZoomIn.duration(150)}
                          style={{ position: 'absolute', left: 24, right: 24, bottom: -16, height: 40, borderRadius: 12, backgroundColor: brand.dark, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...shadow.card }}
                        >
                          <Pressable onPress={() => removeFromCart(item)} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                            <Icon name="minus" size={16} stroke={2.6} color="#FFFFFF" />
                          </Pressable>
                          <Animated.Text key={qty} entering={ZoomIn.duration(120)} style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF', fontSize: 15 }}>
                            {qty}
                          </Animated.Text>
                          <Pressable onPress={() => addToCart(item)} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                            <Icon name="plus" size={16} stroke={2.6} color="#FFFFFF" />
                          </Pressable>
                        </Animated.View>
                      )}
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 14, height: 14, borderWidth: 1.6, borderColor: isVeg ? '#0E8F4A' : '#A0361C', borderRadius: 3, alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{ width: 6, height: 6, borderRadius: isVeg ? 3 : 0, backgroundColor: isVeg ? '#0E8F4A' : '#A0361C' }} />
                    </View>
                    <Text numberOfLines={1} style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900, flex: 1 }}>{item.name}</Text>
                  </View>
                  {item.description ? (
                    <Text numberOfLines={1} style={{ fontSize: 12, color: colors.ink500, marginTop: -6 }}>{item.description}</Text>
                  ) : null}
                  <Text style={{ fontSize: 14, fontFamily: fonts.bodyBold, color: colors.ink900, marginTop: -4 }}>
                    {formatMinor(item.price_minor, item.currency)}
                  </Text>
                </Animated.View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {cartCount > 0 ? (
        <Animated.View entering={SlideInDown.springify().damping(16)} exiting={SlideOutDown.duration(180)} style={{ position: 'absolute', left: 20, right: 20, bottom: 20 }}>
          <Pressable
            onPress={() => setCheckoutOpen(true)}
            style={{
              height: 56,
              borderRadius: radius.pill,
              backgroundColor: brand.dark,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              ...shadow.sheet,
            }}
          >
            <Text style={{ color: '#FFF', fontFamily: fonts.bodyExtraBold }}>{cartCount} item{cartCount > 1 ? 's' : ''}</Text>
            <Text style={{ color: '#FFF', fontFamily: fonts.bodyExtraBold }}>View cart · {formatMinor(cartTotal)}</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}
