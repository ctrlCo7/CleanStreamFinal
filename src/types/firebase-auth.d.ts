// getReactNativePersistence exists in @firebase/auth's React Native build
// but is absent from the default TypeScript types (auth-public.d.ts).
// This augmentation makes it visible to the compiler.
declare module '@firebase/auth' {
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
