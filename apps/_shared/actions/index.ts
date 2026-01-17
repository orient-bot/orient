export type ActionConfirmation = {
  title?: string;
  message: string;
};

export type ActionOptions<TParams, TResult> = {
  name?: string;
  confirm?: ActionConfirmation;
  validate?: (params: TParams) => string | undefined;
  onSuccess?: (result: TResult) => void;
  onError?: (error: Error) => void;
};

export const confirmAction = ({ title, message }: ActionConfirmation): boolean => {
  const prompt = title ? `${title}\n\n${message}` : message;
  return window.confirm(prompt);
};

export const createAction = <TParams, TResult>(
  action: (params: TParams) => Promise<TResult>,
  options: ActionOptions<TParams, TResult> = {}
) => {
  return async (params: TParams): Promise<TResult | null> => {
    const validationError = options.validate?.(params);
    if (validationError) {
      const error = new Error(validationError);
      options.onError?.(error);
      throw error;
    }

    if (options.confirm && !confirmAction(options.confirm)) {
      return null;
    }

    try {
      const result = await action(params);
      options.onSuccess?.(result);
      return result;
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      options.onError?.(normalizedError);
      throw normalizedError;
    }
  };
};
