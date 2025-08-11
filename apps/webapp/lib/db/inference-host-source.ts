import { prisma } from '@/lib/db';
import { InferenceHostSource, InferenceHostSourceOnSource } from '@prisma/client';
import { IS_DOCKER_COMPOSE, USE_LOCALHOST_INFERENCE } from '../env';
import { AuthenticatedUser } from '../with-user';
import { getSourceInferenceHosts } from './source';
import { userCanAccessModelAndSourceSet } from './userCanAccess';

export const LOCALHOST_INFERENCE_HOST = IS_DOCKER_COMPOSE ? 'http://inference:5002' : 'http://127.0.0.1:5002';

// Dynamic inference server discovery
interface InferenceServerInfo {
  port: number;
  modelId: string;
  url: string;
  health: boolean;
}

let _cachedServers: InferenceServerInfo[] = [];
let _lastDiscovery = 0;
const DISCOVERY_CACHE_TTL = 30000; // 30 seconds

/**
 * Discover running inference servers by checking common ports
 * Skips ports 5003 and 5004 as requested
 */
async function discoverInferenceServers(): Promise<InferenceServerInfo[]> {
  const now = Date.now();
  if (now - _lastDiscovery < DISCOVERY_CACHE_TTL && _cachedServers.length > 0) {
    return _cachedServers;
  }

  const servers: InferenceServerInfo[] = [];
  const baseUrl = IS_DOCKER_COMPOSE ? 'http://inference' : 'http://127.0.0.1';
  
  // Check ports 5002, 5005-5020 (skipping 5003, 5004)
  const portsToCheck = [5002];
  for (let port = 5005; port <= 5020; port++) {
    portsToCheck.push(port);
  }

  await Promise.allSettled(
    portsToCheck.map(async (port) => {
      try {
        const url = `${baseUrl}:${port}`;
        const healthResponse = await fetch(`${url}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000), // 2 second timeout
        });

        if (healthResponse.ok) {
          const healthData = await healthResponse.json();
          const modelId = healthData.model_id || healthData.model || 'unknown';
          
          servers.push({
            port,
            modelId,
            url,
            health: true,
          });
        }
      } catch (error) {
        // Server not available on this port, ignore
      }
    })
  );

  _cachedServers = servers;
  _lastDiscovery = now;
  
  console.log(`Discovered ${servers.length} inference servers:`, servers.map(s => `${s.modelId}@${s.port}`));
  return servers;
}

/**
 * Get the best inference server for a specific model
 */
async function getInferenceServerForModel(modelId: string): Promise<string | null> {
  const servers = await discoverInferenceServers();
  
  // First, try to find exact model match
  const exactMatch = servers.find(server => 
    server.health && (
      server.modelId === modelId ||
      server.modelId.includes(modelId) ||
      modelId.includes(server.modelId)
    )
  );
  
  if (exactMatch) {
    return exactMatch.url;
  }

  // If no exact match, return the first available server
  const fallback = servers.find(server => server.health);
  return fallback ? fallback.url : null;
}

/**
 * Get dynamic localhost inference host based on model
 */
export async function getDynamicLocalhostInferenceHost(modelId?: string): Promise<string> {
  if (!modelId) {
    return LOCALHOST_INFERENCE_HOST;
  }

  const dynamicHost = await getInferenceServerForModel(modelId);
  return dynamicHost || LOCALHOST_INFERENCE_HOST;
}

export const createInferenceHostSource = async (input: InferenceHostSource) =>
  prisma.inferenceHostSource.create({
    data: {
      ...input,
    },
  });

export const getInferenceHostSourceById = async (id: string) =>
  prisma.inferenceHostSource.findUnique({ where: { id } });

export const createInferenceHostSourceOnSource = async (input: InferenceHostSourceOnSource) =>
  prisma.inferenceHostSourceOnSource.create({
    data: { ...input },
  });
export const getAllServerHostsForSourceSet = async (modelId: string, sourceSetName: string) => {
  const sources = await prisma.source.findMany({
    where: {
      modelId,
      setName: sourceSetName,
    },
    include: {
      inferenceHosts: { include: { inferenceHost: true } },
    },
  });

  // Flatten the array of arrays into a single array of unique host URLs
  const allHosts = sources.flatMap((source) => source.inferenceHosts.map((host) => host.inferenceHost.hostUrl));
  return allHosts;
};
export const getAllServerHostsForModel = async (modelId: string) => {
  const sources = await prisma.source.findMany({
    where: {
      modelId,
    },
    include: {
      inferenceHosts: { include: { inferenceHost: true } },
    },
  });

  // Flatten the array of arrays into a single array of unique host URLs
  const allHosts = sources.flatMap((source) => source.inferenceHosts.map((host) => host.inferenceHost.hostUrl));
  return allHosts;
};
export const getOneRandomServerHostForSourceSet = async (
  modelId: string,
  sourceSetName: string,
  user: AuthenticatedUser | null = null,
) => {
  const canAccess = await userCanAccessModelAndSourceSet(modelId, sourceSetName, user, true);
  if (!canAccess) {
    return null;
  }

  if (USE_LOCALHOST_INFERENCE) {
    return await getDynamicLocalhostInferenceHost(modelId);
  }

  // TODO: we don't currently support search-all on different instances, so we assume these instances are all the same
  const hosts = await getAllServerHostsForSourceSet(modelId, sourceSetName);
  if (hosts.length === 0) {
    return null;
  }

  // pick a random one
  const randomIndex = Math.floor(Math.random() * hosts.length);
  return hosts[randomIndex];
};
export const getOneRandomServerHostForSource = async (
  modelId: string,
  sourceId: string,
  user: AuthenticatedUser | null = null,
) => {
  if (USE_LOCALHOST_INFERENCE) {
    return await getDynamicLocalhostInferenceHost(modelId);
  }

  const hosts = await getSourceInferenceHosts(modelId, sourceId, user);
  if (!hosts) {
    throw new Error('Source not found.');
  }

  const randomIndex = Math.floor(Math.random() * hosts.length);
  return hosts[randomIndex].inferenceHost.hostUrl;
};
export const getOneRandomServerHostForModel = async (modelId: string) => {
  if (USE_LOCALHOST_INFERENCE) {
    return await getDynamicLocalhostInferenceHost(modelId);
  }

  let hosts = await getAllServerHostsForModel(modelId);
  if (hosts.length === 0) {
    throw new Error('No hosts found.');
  }

  // unique the hosts
  hosts = [...new Set(hosts)];

  return hosts[0];
};
export const getTwoRandomServerHostsForModel = async (modelId: string) => {
  if (USE_LOCALHOST_INFERENCE) {
    const dynamicHost = await getDynamicLocalhostInferenceHost(modelId);
    return [dynamicHost, dynamicHost];
  }

  let hosts = await getAllServerHostsForModel(modelId);
  if (hosts.length === 0) {
    throw new Error('No hosts found.');
  }

  // unique the hosts
  hosts = [...new Set(hosts)];

  if (hosts.length < 2) {
    return [hosts[0], hosts[0]];
  }
  // pick two random, different ones
  const randomIndex = Math.floor(Math.random() * hosts.length);
  let randomIndex2 = Math.floor(Math.random() * hosts.length);
  while (randomIndex2 === randomIndex) {
    randomIndex2 = Math.floor(Math.random() * hosts.length);
  }

  return [hosts[randomIndex], hosts[randomIndex2]];
};
export const getTwoRandomServerHostsForSourceSet = async (
  modelId: string,
  sourceSetName: string,
  user: AuthenticatedUser | null = null,
) => {
  if (USE_LOCALHOST_INFERENCE) {
    const dynamicHost = await getDynamicLocalhostInferenceHost(modelId);
    return [dynamicHost, dynamicHost];
  }

  // ensure we can access the sourceSet
  const canAccess = await userCanAccessModelAndSourceSet(modelId, sourceSetName, user, true);
  if (!canAccess) {
    throw new Error('Source set not found.');
  }

  // TODO: we don't currently support search-all on different instances, so we assume these instances are all the same
  let hosts = await getAllServerHostsForSourceSet(modelId, sourceSetName);
  if (hosts.length === 0) {
    throw new Error('No hosts found.');
  }

  // unique the hosts
  hosts = [...new Set(hosts)];

  if (hosts.length < 2) {
    return [hosts[0], hosts[0]];
  }
  // pick two random, different ones
  const randomIndex = Math.floor(Math.random() * hosts.length);
  let randomIndex2 = Math.floor(Math.random() * hosts.length);
  while (randomIndex2 === randomIndex) {
    randomIndex2 = Math.floor(Math.random() * hosts.length);
  }

  return [hosts[randomIndex], hosts[randomIndex2]];
};
