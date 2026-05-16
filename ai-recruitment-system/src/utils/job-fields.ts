export type JobField = 'Technology' | 'Security' | 'Medical';

export const JOB_FIELD_OPTIONS: Array<{
  value: JobField;
  label: string;
  icon: string;
  description: string;
}> = [
  {
    value: 'Technology',
    label: 'Technology',
    icon: 'code',
    description: 'Software, data, AI, infrastructure, and IT roles.',
  },
  {
    value: 'Security',
    label: 'Security',
    icon: 'security',
    description: 'Security guard, patrol, access control, and site protection roles.',
  },
  {
    value: 'Medical',
    label: 'Medical',
    icon: 'medical_services',
    description: 'Doctor, surgeon, nurse, clinic, and hospital support roles.',
  },
];

export const DEFAULT_JOB_FIELD: JobField = 'Technology';

export function isJobField(value?: string | null): value is JobField {
  return JOB_FIELD_OPTIONS.some(field => field.value === value);
}

export function fieldIcon(value?: string | null) {
  return JOB_FIELD_OPTIONS.find(field => field.value === value)?.icon || 'work';
}
