import { z } from 'zod';

const baseProps = z.object({ className: z.string().optional() }).passthrough();

export const SharedComponentCatalog = {
  Button: {
    props: z
      .object({
        variant: z.enum(['primary', 'secondary', 'ghost']).optional(),
        size: z.enum(['sm', 'md', 'lg']).optional(),
        loading: z.boolean().optional(),
        disabled: z.boolean().optional(),
      })
      .merge(baseProps),
    hasChildren: true,
  },
  Card: {
    props: baseProps,
    hasChildren: true,
  },
  CardHeader: {
    props: baseProps,
    hasChildren: true,
  },
  CardTitle: {
    props: baseProps,
    hasChildren: true,
  },
  CardDescription: {
    props: baseProps,
    hasChildren: true,
  },
  CardContent: {
    props: baseProps,
    hasChildren: true,
  },
  CardFooter: {
    props: baseProps,
    hasChildren: true,
  },
  Input: {
    props: z
      .object({
        label: z.string().optional(),
        error: z.string().optional(),
        helperText: z.string().optional(),
        checks: z.array(z.any()).optional(),
        validateOn: z.enum(['blur', 'change', 'submit', 'none']).optional(),
      })
      .merge(baseProps),
    hasChildren: false,
  },
  Select: {
    props: z
      .object({
        label: z.string().optional(),
        placeholder: z.string().optional(),
        options: z
          .array(
            z.object({
              label: z.string(),
              value: z.union([z.string(), z.number()]),
            })
          )
          .optional(),
      })
      .merge(baseProps),
    hasChildren: false,
  },
  DateTimePicker: {
    props: z
      .object({
        label: z.string().optional(),
        value: z.any().optional(),
        minDate: z.any().optional(),
        maxDate: z.any().optional(),
      })
      .merge(baseProps),
    hasChildren: false,
  },
};

export const sharedComponentNames = Object.keys(SharedComponentCatalog);
