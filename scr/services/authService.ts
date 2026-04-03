// src/services/authService.ts
// Replaces: Firebase-based authService.ts
// Uses: Supabase Auth + Supabase Storage

import { supabase } from './supabase';
import { User } from '../types';

// ─── Helper: map Supabase profile row → our User type ────────────────────────
function mapProfileToUser(
  supabaseUser: { id: string; email?: string | null },
  profile: {
    name: string;
    photo_url?: string | null;
    bio?: string | null;
    notifications?: any;
    preferences?: any;
  }
): User {
  return {
    id: supabaseUser.id,
    email: supabaseUser.email ?? '',
    name: profile.name,
    photoURL: profile.photo_url ?? undefined,
    bio: profile.bio ?? undefined,
    notifications: profile.notifications ?? {
      email: true,
      push: true,
      activitySummary: true,
    },
    preferences: profile.preferences ?? {
      theme: 'light',
      language: 'vi',
    },
  };
}

export const authService = {
  // ── LOGIN ──────────────────────────────────────────────────────────────────
  login: async (email: string, password: string): Promise<User> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Đăng nhập thất bại');

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      throw new Error('Không thể tải thông tin người dùng');
    }

    return mapProfileToUser(data.user, profile);
  },

  // ── REGISTER ───────────────────────────────────────────────────────────────
  register: async (name: string, email: string, password: string): Promise<User> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name }, // stored in raw_user_meta_data, picked up by DB trigger
      },
    });

    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Không thể tạo tài khoản');

    // Trigger (handle_new_user) auto-creates profile row.
    // Upsert here to ensure name is saved even if trigger beat us to it.
    await supabase.from('profiles').upsert({
      id: data.user.id,
      name,
      email,
    });

    return {
      id: data.user.id,
      email: data.user.email ?? '',
      name,
    };
  },

  // ── LOGOUT ─────────────────────────────────────────────────────────────────
  logout: async () => {
    await supabase.auth.signOut();
  },

  // ── DELETE ACCOUNT ─────────────────────────────────────────────────────────
  // BUG FIX: previous version only deleted the profiles row and signed out.
  // The auth.users row remained, so the user could re-login and the email
  // was permanently "taken" with no way to recover.
  //
  // Now calls the Edge Function "delete-user" which uses the service-role key
  // to call supabase.auth.admin.deleteUser() — this properly removes the
  // auth.users row and triggers the ON DELETE CASCADE on profiles.
  //
  // DEPLOY REQUIRED: supabase/functions/delete-user/index.ts must be deployed.
  // See: supabase functions deploy delete-user
  deleteAccount: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Không tìm thấy người dùng');

    // Call Edge Function for hard-delete (service-role, bypasses client restrictions)
    const { error } = await supabase.functions.invoke('delete-user');
    if (error) throw new Error(error.message);

    await supabase.auth.signOut();
  },

  // ── GET CURRENT USER ───────────────────────────────────────────────────────
  getCurrentUser: async (): Promise<User | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!profile) return null;
    return mapProfileToUser(user, profile);
  },

  // ── UPDATE PROFILE ─────────────────────────────────────────────────────────
  updateUserProfile: async (
    userId: string,
    updates: {
      name?: string;
      photoURL?: string;
      bio?: string;
      notifications?: { email: boolean; push: boolean; activitySummary: boolean };
      preferences?: { theme: 'light' | 'dark' | 'system'; language: 'vi' | 'en' };
    }
  ) => {
    const payload: Record<string, any> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.photoURL !== undefined) payload.photo_url = updates.photoURL;
    if (updates.bio !== undefined) payload.bio = updates.bio;
    if (updates.notifications !== undefined) payload.notifications = updates.notifications;
    if (updates.preferences !== undefined) payload.preferences = updates.preferences;

    const { error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', userId);

    if (error) throw new Error(error.message);
  },

  // ── CHANGE PASSWORD ────────────────────────────────────────────────────────
  updateUserPassword: async (currentPassword: string, newPassword: string) => {
    // Re-authenticate by signing in fresh
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) throw new Error('Không tìm thấy email người dùng');

    const { error: reAuthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (reAuthError) throw new Error('Mật khẩu hiện tại không đúng');

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  },

  // ── UPLOAD AVATAR ──────────────────────────────────────────────────────────
  uploadAvatar: async (userId: string, file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const filePath = `${userId}/avatar.${fileExt}`;

    // Upsert: overwrite previous avatar
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true });

    if (uploadError) throw new Error(uploadError.message);

    const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
    // Bust cache with timestamp
    return `${data.publicUrl}?t=${Date.now()}`;
  },
};
