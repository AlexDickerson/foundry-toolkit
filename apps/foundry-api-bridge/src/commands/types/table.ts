/** Roll table command params and results. */

// Roll Table types
export type ListRollTablesParams = Record<string, never>;

export interface GetRollTableParams {
  tableId: string;
}

export interface RollOnTableParams {
  tableId: string;
  displayChat?: boolean;
}

export interface ResetTableParams {
  tableId: string;
}

export interface CreateTableResultData {
  text: string;
  range: [number, number];
  weight?: number;
  type?: number;
  documentCollection?: string;
  documentId?: string;
  img?: string;
}

export interface CreateRollTableParams {
  name: string;
  formula?: string;
  replacement?: boolean;
  displayRoll?: boolean;
  description?: string;
  img?: string;
  folder?: string;
  results?: CreateTableResultData[];
}

export interface UpdateRollTableParams {
  tableId: string;
  name?: string;
  formula?: string;
  replacement?: boolean;
  displayRoll?: boolean;
  description?: string;
  img?: string;
}

export interface DeleteRollTableParams {
  tableId: string;
}

export interface TableResultData {
  id: string;
  type: number;
  text: string;
  img: string;
  range: [number, number];
  weight: number;
  drawn: boolean;
  documentCollection: string | null;
  documentId: string | null;
}

export interface RollTableSummary {
  id: string;
  name: string;
  img: string;
  description: string;
  formula: string;
  replacement: boolean;
  totalResults: number;
  drawnResults: number;
}

export interface RollTableResult {
  id: string;
  name: string;
  img: string;
  description: string;
  formula: string;
  replacement: boolean;
  displayRoll: boolean;
  results: TableResultData[];
}

export interface RollOnTableResult {
  tableId: string;
  tableName: string;
  roll: {
    formula: string;
    total: number;
  };
  results: TableResultData[];
}

export interface ResetTableResult {
  tableId: string;
  tableName: string;
  resetCount: number;
}
