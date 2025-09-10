import { type SignLetterInput, type LetterRequest } from '../schema';

export async function signLetter(input: SignLetterInput, dekanUserId: number): Promise<LetterRequest> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is digitally signing the letter by the Dean.
    // It should:
    // 1. Validate that the user is a Dean and has permission for this request
    // 2. Apply digital signature to the final letter
    // 3. Update request status to TTD_DONE
    // 4. Set current handler to Staff Fakultas for return processing
    // 5. Create tracking log entry
    // 6. Notify Staff Fakultas that signed letter is ready
    return Promise.resolve({
        id: input.request_id,
        student_id: 0,
        created_by_user_id: 0,
        letter_type: '',
        purpose: '',
        priority: 'NORMAL',
        status: 'TTD_DONE',
        current_handler_user_id: null, // Should be set to Staff Fakultas
        dekan_instructions: null,
        final_letter_url: '', // Should contain the signed letter URL
        created_at: new Date(),
        updated_at: new Date()
    } as LetterRequest);
}