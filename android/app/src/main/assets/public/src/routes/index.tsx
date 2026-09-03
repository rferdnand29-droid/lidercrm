import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  head: () => ({
    title: 'Lider CRM - Versão Final',
    meta: [
      { name: 'description', content: 'Projeto Lider CRM com correções de acesso administrativo e novos cargos aplicada.' },
      { property: 'og:title', content: 'Lider CRM - Versão Final' },
      { property: 'og:type', content: 'website' }
    ]
  }),
  component: () => (
    <div className="min-h-screen bg-[#0A0C10] text-[#EEE8D5] flex items-center justify-center p-4 text-center font-sans">
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-bold">Lider CRM Finalizado</h1>
        <p className="text-lg opacity-90">Todas as correções de cargos e permissões administrativas foram implementadas com sucesso.</p>
        <div className="pt-4">
           <a 
             href="/index.html" 
             className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
           >
             Acessar Sistema
           </a>
        </div>
        <p className="text-sm mt-8 opacity-60">Projeto pronto para download via botão de publicação.</p>
      </div>
    </div>
  ),
})
