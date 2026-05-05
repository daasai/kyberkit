import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/layout";
import { ComponentsGalleryPage } from "./features/gallery";
import { OverviewModal, useOverviewModal } from "./features/overview";
import { SessionsPage } from "./features/sessions";
import {
  AuditPage,
  ContractsPage,
  EvolutionPage,
  MemoryPage,
  PreferencesPage,
  SettingsShell,
  SkillsPage,
} from "./features/settings";

export function AppRouter() {
  const overview = useOverviewModal();

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/c" replace />} />
        <Route path="/c" element={<SessionsPage />} />
        <Route path="/c/:sessionId" element={<SessionsPage />} />
        <Route path="/__components" element={<ComponentsGalleryPage />} />
        <Route path="/settings" element={<SettingsShell onOpenOverview={overview.openNow} />}>
          <Route index element={<Navigate to="/settings/contracts" replace />} />
          <Route path="contracts" element={<ContractsPage />} />
          <Route path="evolution" element={<EvolutionPage />} />
          <Route path="memory" element={<MemoryPage />} />
          <Route path="skills" element={<SkillsPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="preferences" element={<PreferencesPage />} />
        </Route>
      </Routes>
      <OverviewModal open={overview.open} onClose={overview.closeOnly} onDismiss={overview.closeAndDismiss} />
    </AppLayout>
  );
}
