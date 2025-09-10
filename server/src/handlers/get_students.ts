import { type Student } from '../schema';

export async function getStudents(searchTerm?: string): Promise<Student[]> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is retrieving students for selection in letter requests.
    // It should:
    // 1. If searchTerm provided, filter by NIM or name containing the term
    // 2. Limit results to prevent overwhelming the UI
    // 3. Sort by name for easy browsing
    // 4. Used by Staff Prodi when creating new letter requests
    return Promise.resolve([]);
}