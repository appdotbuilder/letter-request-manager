import { type CreateLetterRequestInput, type LetterRequest } from '../schema';

export async function createLetterRequest(input: CreateLetterRequestInput, userId: number): Promise<LetterRequest> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is creating a new letter request submitted by Staff Prodi.
    // It should:
    // 1. Create the letter request with DRAFT status
    // 2. Upload supporting documents if provided
    // 3. Create initial tracking log entry
    // 4. Set current handler to Kaprodi for the student's program
    return Promise.resolve({
        id: 0, // Placeholder ID
        student_id: input.student_id,
        created_by_user_id: userId,
        letter_type: input.letter_type,
        purpose: input.purpose,
        priority: input.priority,
        status: 'DRAFT',
        current_handler_user_id: null, // Should be set to appropriate Kaprodi
        dekan_instructions: null,
        final_letter_url: null,
        created_at: new Date(),
        updated_at: new Date()
    } as LetterRequest);
}