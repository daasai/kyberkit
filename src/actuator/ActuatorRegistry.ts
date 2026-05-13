/**
 * v1.5 Actuator 白名单与风险等级（PRD §3.2.1, §10）。
 */

export type ActuatorRisk = 'low' | 'medium' | 'high'

export const V15_ACTUATOR_WHITELIST: ReadonlyMap<string, ActuatorRisk> = new Map([
  ['artifact.markdown.generate', 'low'],
  ['artifact.html-ppt.generate', 'low'],
  ['artifact.xls.generate', 'low'],
  ['artifact.feishu-doc.write', 'medium'],
])

export function isWhitelistedActuator(id: string): boolean {
  return V15_ACTUATOR_WHITELIST.has(id)
}

export function getActuatorRisk(id: string): ActuatorRisk | undefined {
  return V15_ACTUATOR_WHITELIST.get(id)
}

export function requiresSignoff(id: string): boolean {
  return getActuatorRisk(id) === 'medium' || getActuatorRisk(id) === 'high'
}
