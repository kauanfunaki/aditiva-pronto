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
import AuditHonorarios from './pages/audit/Honorarios';
import Login from './pages/Login';
import { useSessao } from './hooks/useSessao';

export default function App() {
  const { usuario, carregando, erro } = useSessao();

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950" role="status">
        <span className="text-sm text-gray-500 dark:text-zinc-400">Carregando…</span>
      </div>
    );
  }
  if (erro) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950 px-4" role="alert">
        <p className="text-sm text-red-700 dark:text-red-400">
          Não foi possível falar com o servidor ({erro.message}). Recarregue a página.
        </p>
      </div>
    );
  }
  if (!usuario) return <Login />;

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
            <Route path="auditoria/honorarios" element={<AuditHonorarios />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
