export {};

// getReactNativePersistence exists in @firebase/auth's React Native build
// but is absent from the default TypeScript types (auth-public.d.ts).
// This augmentation adds it without replacing the rest of the module's types.
declare module '@firebase/auth' {
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
