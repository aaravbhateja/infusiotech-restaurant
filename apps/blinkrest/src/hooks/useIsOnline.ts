import { useNetInfo } from '@react-native-community/netinfo';

// `isConnected`/`isInternetReachable` start out `null` until the first
// check resolves — treat that as online so screens don't flash an offline
// banner on every cold start before NetInfo has had a chance to report.
export function useIsOnline() {
  const { isConnected, isInternetReachable } = useNetInfo();
  return isConnected !== false && isInternetReachable !== false;
}
