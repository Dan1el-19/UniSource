declare module 'cloudflare:workers' {
  interface ProvidedEnv extends CloudflareBindings {}
}

declare namespace Cloudflare {
  interface Env extends CloudflareBindings {}
}