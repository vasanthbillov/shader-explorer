import { createContext, useContext } from "react";
import type {
  ShaderProject,
  Collection,
  LibraryPreference,
} from "../shared/types";
export interface AppData {
  projects: ShaderProject[];
  collections: Collection[];
  preferences: LibraryPreference[];
  storageError: string;
  loading: boolean;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  openProject: (p: ShaderProject, quick?: boolean) => Promise<void>;
  createProject: () => Promise<void>;
  favorites: (id: string) => Promise<void>;
}
export const DataContext = createContext<AppData>(null!);
export const useData = () => useContext(DataContext);
