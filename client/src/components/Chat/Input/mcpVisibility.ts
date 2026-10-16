/** Dedicated composer controls own these integrations; selection state stays with the manager. */
export function genericMCPServers<T extends { serverName: string }>(servers?: T[]): T[] {
  return servers?.filter((server) => server.serverName !== 'CJ-Google-Tools') ?? [];
}
