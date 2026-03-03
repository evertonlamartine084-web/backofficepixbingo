import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Batches from "@/pages/Batches";
import BatchDetail from "@/pages/BatchDetail";
import Duplicates from "@/pages/Duplicates";
import PlayerLookup from "@/pages/PlayerLookup";
import Endpoints from "@/pages/admin/Endpoints";
import BonusRules from "@/pages/admin/BonusRules";
import Discovery from "@/pages/admin/Discovery";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/batches" element={<Batches />} />
            <Route path="/batches/:id" element={<BatchDetail />} />
            <Route path="/duplicates" element={<Duplicates />} />
            <Route path="/player" element={<PlayerLookup />} />
            <Route path="/admin/endpoints" element={<Endpoints />} />
            <Route path="/admin/bonus-rules" element={<BonusRules />} />
            <Route path="/admin/discovery" element={<Discovery />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
