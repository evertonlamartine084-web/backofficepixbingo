import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Login from "@/pages/Login";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Lazy-load all authenticated pages (Dashboard is heavy — 391KB DashboardCharts)
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const PlayerLookup = lazy(() => import("@/pages/PlayerLookup"));
const Transactions = lazy(() => import("@/pages/Transactions"));
const Segments = lazy(() => import("@/pages/Segments"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const Popups = lazy(() => import("@/pages/Popups"));
const PopupAssets = lazy(() => import("@/pages/assets/PopupAssets"));
const Cashback = lazy(() => import("@/pages/Cashback"));
const ManageUsers = lazy(() => import("@/pages/admin/ManageUsers"));
const AuditLog = lazy(() => import("@/pages/admin/AuditLog"));
const PlatformConfig = lazy(() => import("@/pages/admin/PlatformConfig"));
const Profile = lazy(() => import("@/pages/Profile"));
const Levels = lazy(() => import("@/pages/assets/Levels"));
const Store = lazy(() => import("@/pages/assets/Store"));
const Push = lazy(() => import("@/pages/assets/Push"));
const InboxMessages = lazy(() => import("@/pages/assets/Inbox"));
const Achievements = lazy(() => import("@/pages/gamification/Achievements"));
const Missions = lazy(() => import("@/pages/gamification/Missions"));
const Tournaments = lazy(() => import("@/pages/gamification/Tournaments"));
const DailyWheel = lazy(() => import("@/pages/gamification/DailyWheel"));
const WidgetPreview = lazy(() => import("@/pages/gamification/WidgetPreview"));
const MiniGames = lazy(() => import("@/pages/gamification/MiniGames"));
const MiniGamesPlayer = lazy(() => import("@/pages/gamification/MiniGamesPlayer"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60_000,
      networkMode: 'always',
    },
  },
});

const App = () => (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/segments" element={<Segments />} />
              <Route path="/campaigns" element={<Campaigns />} />
              <Route path="/assets/popups" element={<Popups />} />
              <Route path="/assets/html" element={<PopupAssets />} />
              <Route path="/cashback" element={<Cashback />} />
              <Route path="/player" element={<PlayerLookup />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/admin/manage-users" element={<ManageUsers />} />
              <Route path="/admin/audit" element={<AuditLog />} />
              <Route path="/admin/platform" element={<PlatformConfig />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/popups" element={<Popups />} />
              <Route path="/assets/levels" element={<Levels />} />
              <Route path="/assets/store" element={<Store />} />
              <Route path="/assets/push" element={<Push />} />
              <Route path="/assets/inbox" element={<InboxMessages />} />
              <Route path="/gamification/achievements" element={<Achievements />} />
              <Route path="/gamification/missions" element={<Missions />} />
              <Route path="/gamification/tournaments" element={<Tournaments />} />
              <Route path="/gamification/wheel" element={<DailyWheel />} />
              <Route path="/gamification/widget" element={<WidgetPreview />} />
              <Route path="/gamification/mini-games" element={<MiniGames />} />
              <Route path="/gamification/mini-games-player" element={<MiniGamesPlayer />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
