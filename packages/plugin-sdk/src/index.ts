import { z } from "zod";

export const PluginCapabilitySchema = z.enum([
  "tool",
  "provider",
  "ui-panel",
  "slash-command",
  "theme",
  "importer",
  "exporter",
]);

export const PluginPermissionSchema = z.enum(["network", "storage", "filesystem"]);

export const PluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/),
  apiVersion: z.string().min(1),
  capabilities: z.array(PluginCapabilitySchema).min(1),
  permissions: z.array(PluginPermissionSchema),
});

export type PluginCapability = z.infer<typeof PluginCapabilitySchema>;
export type PluginPermission = z.infer<typeof PluginPermissionSchema>;
export type PluginManifest = z.infer<typeof PluginManifestSchema>;
