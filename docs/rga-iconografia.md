# Iconografia RGA ATS

Pictogramas SVG nativos em `src/components/ui/rga-icons.tsx`, inspirados na proposta visual RGA: grade 24×24, contornos arredondados, cor de primeiro plano herdada e pequenos acentos #1581C9, #6C336E e #F9C82B. Sem imagens raster, fontes de ícones externas ou novas dependências.

Aplicados à navegação desktop, barra móvel, menu Mais, busca global, indicadores e ações rápidas do painel. Ícone DISC exportado para integração posterior sem alterar o fluxo que está em desenvolvimento. Ícones utilitários (sair, setas, adicionar e botões compactos) mantêm Lucide quando adequado. Não reintroduzir itens removidos do menu, como Comunicados.

Os SVGs decorativos usam aria-hidden; links e botões preservam rótulos e permissões. O tamanho recomendado é 20–22px na navegação e 23–27px nos cartões. Não alterar o nome ou comportamento das rotas. Sem migração.

Aceite: executar typecheck, testes e build; conferir contraste e legibilidade em desktop, menu mobile e modo escuro/claro, foco de teclado, zoom e navegação com perfil de recrutadora. Testes e validação visual autenticada não executados nesta alteração pelo conector.
