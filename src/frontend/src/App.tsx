import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Companies from './pages/Companies';
import CompanyDetail from './pages/CompanyDetail';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import AuditPastas from './pages/audit/Pastas';
import AuditAditivos from './pages/audit/Aditivos';
import AuditContratos from './pages/audit/Contratos';

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="empresas" element={<Companies />} />
            <Route path="empresas/:id" element={<CompanyDetail />} />
            <Route path="relatorios" element={<Reports />} />
            <Route path="configuracoes" element={<Settings />} />
            <Route path="auditoria/pastas" element={<AuditPastas />} />
            <Route path="auditoria/aditivos" element={<AuditAditivos />} />
            <Route path="auditoria/contratos" element={<AuditContratos />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
