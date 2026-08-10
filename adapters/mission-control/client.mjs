import { MissionControlClient } from '../../src/mission-control-client.mjs';

export function createMissionControlAdapter(options = {}) {
  return new MissionControlClient(options);
}
