import { z } from 'zod';
const text = (max: number) => z.string().trim().max(max);
export const draftSchema = z.object({
    name: text(150).default(''), phone: text(30).default(''),
    provinceId: text(10).default(''), districtId: text(10).default(''), localLevelId: text(10).default(''),
    ward: text(2).default(''), dob: text(30).default(''),
    dobCalendar: z.enum(['AD', 'BS', 'unknown']).default('unknown'),
    citizenship: text(100).default(''), motivation: text(2000).default(''), skills: text(1000).default(''),
    publicProfile: z.boolean().default(false), consent: z.boolean().default(false),
});
export type RegistrationDraft = z.infer<typeof draftSchema>;
export const emptyDraft: RegistrationDraft = draftSchema.parse({});
export function registrationErrors(data: RegistrationDraft): Record<string, string> {
    const errors: Record<string, string> = {};
    if (data.name.length < 2) errors.name = 'पूरा नाम लेख्नुहोस् / Enter your full name.';
    const phone = data.phone.replace(/[०-९]/g, c => String('०१२३४५६७८९'.indexOf(c))).replace(/[\s()-]/g, '');
    if (!/^\+?[0-9]{7,15}$/.test(phone)) errors.phone = 'फोन नम्बर जाँच्नुहोस् / Enter a valid phone number.';
    for (const key of ['provinceId', 'districtId', 'localLevelId'] as const) {
        if (!/^[1-9][0-9]*$/.test(data[key])) errors[key] = 'कृपया छान्नुहोस् / Please select a location.';
    }
    if (!data.consent) errors.consent = 'विवरण बुझेर सहमति दिनुहोस् / Please confirm your consent.';
    if (data.dob && data.dobCalendar === 'unknown') errors.dobCalendar = 'AD वा BS छान्नुहोस् / Choose AD or BS.';
    return errors;
}
