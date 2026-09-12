// حارس المسارات — يتحكم في صلاحية الوصول
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const PUBLIC_ROUTES = ['/', '/login', '/splash'];

interface RouteGuardProps {
  children: React.ReactNode;
  adminOnly?: boolean;
  merchantOnly?: boolean;
}

export function RouteGuard({ children, adminOnly = false, merchantOnly = false }: RouteGuardProps) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  // أثناء تحميل Auth نُرجع null بدلاً من شاشة "جاري التحميل"
  // لأن SplashOverlay يغطي الشاشة بالكامل في هذه المرحلة
  // وظهور شاشة تحميل إضافية يُحدث ارتعاشاً مرئياً غير مقصود
  if (loading) {
    return null;
  }

  const isPublic = PUBLIC_ROUTES.includes(location.pathname);

  if (!user && !isPublic) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (adminOnly && profile?.role !== 'admin' && profile?.role !== 'super_admin') {
    return <Navigate to="/home" replace />;
  }

  if (merchantOnly && profile?.role !== 'merchant' && profile?.role !== 'admin' && profile?.role !== 'super_admin') {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
}