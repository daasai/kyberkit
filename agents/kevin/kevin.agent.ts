import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { AgentProductDef } from '../../src/types/agent-product.js';

const here = dirname(fileURLToPath(import.meta.url));

const KEVIN_AGENT_DEF: AgentProductDef = {
  id: 'kevin',
  name: 'Kevin',
  platformDirective: readFileSync(join(here, 'directives.md'), 'utf-8').trim(),
  permissions: {
    denied: ['write_fs'],
  },
};

export default KEVIN_AGENT_DEF;
export { KEVIN_AGENT_DEF };

