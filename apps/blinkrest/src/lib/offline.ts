import { Alert } from 'react-native';

// Call at the top of a write handler before it touches the network.
// Returns false (and shows an explanation) when offline, so the caller can
// bail out instead of firing a request that will fail with a cryptic
// "Network request failed" — and, worse, instead of the user not knowing
// whether their tap did anything at all.
export function guardOnline(isOnline: boolean): boolean {
  if (!isOnline) {
    Alert.alert("You're offline", "Connect to the internet and try again.");
    return false;
  }
  return true;
}
