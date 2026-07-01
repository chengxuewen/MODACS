import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createRoute,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { Layout } from './components/Layout'
import { lazy, Suspense } from 'react'

const Overview = lazy(() => import('./pages/Overview').then(m => ({ default: m.Overview })))
const TopicGraph = lazy(() => import('./pages/TopicGraph').then(m => ({ default: m.TopicGraph })))
const RpcConsole = lazy(() => import('./pages/RpcConsole').then(m => ({ default: m.RpcConsole })))
const LogViewer = lazy(() => import('./pages/LogViewer').then(m => ({ default: m.LogViewer })))
const McapBridge = lazy(() => import('./pages/McapBridge').then(m => ({ default: m.McapBridge })))
const DataFlow = lazy(() => import('./pages/DataFlow').then(m => ({ default: m.DataFlow })))
const MessagePublisher = lazy(() => import('./components/MessagePublisher').then(m => ({ default: m.MessagePublisher })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

const rootRoute = createRootRoute({ component: Layout })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Overview,
})

const topicsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/topics',
  component: TopicGraph,
})

const rpcRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/rpc',
  component: RpcConsole,
})

const logsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/logs',
  component: LogViewer,
})

const mcapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/mcap',
  component: McapBridge,
})

const flowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/flow',
  component: DataFlow,
})

const publishRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/publish',
  component: MessagePublisher,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  topicsRoute,
  rpcRoute,
  logsRoute,
  mcapRoute,
  flowRoute,
  publishRoute,
])

export const router = createRouter({ routeTree, basepath: '/debug' })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<div className="flex h-full items-center justify-center text-zinc-500">Loading...</div>}>
        <RouterProvider router={router} />
      </Suspense>
    </QueryClientProvider>
  )
}
