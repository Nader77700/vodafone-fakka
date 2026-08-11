// حارس المسارات — يتحكم في صلاحية الوصول
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm">جاري التحميل...</p>
        </div>
      </div>
    );
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