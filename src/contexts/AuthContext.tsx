import { createContext, useContext } from 'react';
import type { User } from 'firebase/auth';

export type AuthContextType = {
  /** Ang kasalukuyang naka-login na user, o `null` kung wala. */
  user: User | null;

  /**
   * `true` kapag tapos na ang initial Firebase auth check.
   *
   * Ito ay HINDI "may user ba?" — ito ay "tapos na ba ang check?".
   * Kapag `false`, huwag mag-redirect; maghintay muna.
   * Ito ang pumipigil sa random `/home` reset kapag may token refresh.
   */
  authReady: boolean;
};

export const AuthContext = createContext<AuthContextType>({
  user: null,
  authReady: false,
});

/**
 * Hook para basahin ang auth state saanman sa app.
 *
 * Halimbawa:
 *   const { user, authReady } = useAuth();
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthContext.Provider');
  }

  return context;
};