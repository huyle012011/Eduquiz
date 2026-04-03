// src/pages/ResetPassword.tsx
// Handles the password-reset redirect from Supabase email.
//
// Flow:
//   1. User clicks "Reset Password" in email
//   2. Supabase redirects to: https://your-app.vercel.app/#/reset-password
//      with a one-time token in the URL hash (handled automatically by Supabase JS SDK
//      via detectSessionInUrl: true in supabase.ts)
//   3. This page lets the user set a new password

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';

export const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // Supabase emits SIGNED_IN / PASSWORD_RECOVERY when the token in the URL is valid.
  // detectSessionInUrl: true (set in supabase.ts) handles parsing automatically.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setSessionReady(true);
      }
    });

    // If a session already exists when the page loads (token already parsed)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async () => {
    setError(null);

    if (password.length < 8) {
      setError('Mật khẩu phải có ít nhất 8 ký tự.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setIsLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);
    // Redirect to home after 2 seconds
    setTimeout(() => navigate('/'), 2000);
  };

  // Token not yet parsed or invalid
  if (!sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md p-8 w-full max-w-md text-center space-y-4">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-500 dark:text-slate-400">Đang xác thực liên kết đặt lại mật khẩu...</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Nếu trang này không tải được, liên kết có thể đã hết hạn.{' '}
            <button
              className="text-indigo-600 underline"
              onClick={() => navigate('/forgot-password')}
            >
              Yêu cầu lại
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md p-8 w-full max-w-md space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Đặt mật khẩu mới</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Nhập mật khẩu mới cho tài khoản của bạn.
          </p>
        </div>

        {/* Success state */}
        {success ? (
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-xl p-4 text-center space-y-2">
            <p className="text-green-800 dark:text-green-300 font-medium">Đổi mật khẩu thành công!</p>
            <p className="text-sm text-green-600 dark:text-green-400">Đang chuyển hướng về trang chủ...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Error banner */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl p-3">
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            {/* New password */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Mật khẩu mới
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Tối thiểu 8 ký tự"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600
                           bg-white dark:bg-slate-700 text-slate-900 dark:text-white
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                           placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            {/* Confirm password */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Xác nhận mật khẩu
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu mới"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600
                           bg-white dark:bg-slate-700 text-slate-900 dark:text-white
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                           placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={isLoading || !password || !confirmPassword}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400
                         text-white font-semibold rounded-xl transition-colors duration-150
                         flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Đang cập nhật...
                </>
              ) : (
                'Đặt mật khẩu mới'
              )}
            </button>

            <button
              onClick={() => navigate('/')}
              className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400
                         dark:hover:text-slate-200 transition-colors"
            >
              Hủy, về trang chủ
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
