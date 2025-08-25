declare type CommonResponse<T, U = object> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      data: U;
    };
