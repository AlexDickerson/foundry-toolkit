/** Shared result shapes and types used across multiple command domains. */

export interface DeleteResult {
  deleted: boolean;
}

export interface MutationResult {
  id: string;
}

export interface TokenHpData {
  value: number;
  max: number;
}
