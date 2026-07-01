import type { ComponentType } from 'react';

export interface PanelProps {
  topicBus?: unknown;
  activeTopic?: string;
}

export interface PanelDefinition {
  name: string;
  component: ComponentType<PanelProps>;
  icon?: string;
  defaultLayout?: 'full' | 'half' | 'quarter';
}

class PanelRegistry {
  private panels = new Map<string, PanelDefinition>();

  register(def: PanelDefinition): void {
    this.panels.set(def.name, def);
  }

  get(name: string): PanelDefinition | undefined {
    return this.panels.get(name);
  }

  list(): PanelDefinition[] {
    return [...this.panels.values()];
  }
}

// Singleton
export const panelRegistry = new PanelRegistry();
