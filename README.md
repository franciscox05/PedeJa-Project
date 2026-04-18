# 🛵 PedeJa Platform

Um sistema completo e escalável de entregas de comida (Food Delivery) com fluxo de checkout integrado, operações em tempo real e dashboards de gestão específicos para cada papel do ecossistema.

<p align="left">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" />
  <img src="https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E" />
  <img src="https://img.shields.io/badge/Supabase-181818?style=for-the-badge&logo=supabase&logoColor=white" />
</p>

## 👥 Perfis de Utilizador

A plataforma adapta a sua interface e permissões consoante o papel do utilizador:
* **Cliente:** Navegação, gestão de carrinho, moradas e checkout.
* **Admin:** Dashboard Enterprise (KPIs, alertas de SLA, top lojas, aprovações de novos restaurantes).
* **Restaurante:** Fila operacional em tempo real, monitorização de SLA e analytics de vendas.
* **DevOps:** Monitor de integrações e visualização de webhooks.

## ✨ Funcionalidades Chave

* **Gestão de Moradas Avançada:** Perfis com *labels* (Casa/Trabalho/Outro), autocompletar e seleção automática no carrinho.
* **Checkout & Logística:** Despacho automático de pedidos via integração com **Shipday**.
* **Onboarding de Parceiros:** Sistema de registo com pedido de perfil de Restaurante (sujeito a aprovação do Admin).
* **Operação em Tempo Real:** Atualizações dinâmicas na fila operacional e alertas de SLA para evitar atrasos.

## 🛠️ Stack Tecnológico

* **Frontend:** React + Vite
* **Backend & Base de Dados:** Supabase (Database + Edge Functions)
* **Logística:** Integração com a API do Shipday Drive

---

## 🚀 Como Correr Localmente

### Pré-requisitos
* Node.js instalado
* Conta Supabase e Shipday configuradas (para as variáveis de ambiente)

### 1. Instalação
```bash
npm install
