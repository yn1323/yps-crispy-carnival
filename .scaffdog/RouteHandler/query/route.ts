import prisma from '@/prisma/libs/db';
import type { BaseFetch } from '@/src/services/common/fetch';
import type { Prisma } from '@prisma/client';
import type { NextRequest } from 'next/server';

export type {{ inputs.method | pascal }}{{ inputs.pathWithoutSlash | pascal }} = BaseFetch & {
  response: CommonResponse<Prisma.UserCreateArgs['data']>;
  mutation: query: Prisma.UserCreateInput;
  method: 'POST'
};

const {{ inputs.method | pascal }}ApiName = '{{ inputs.method | pascal }}{{ inputs.pathWithoutSlash | pascal }}';
export const {{ inputs.method | constant }} = async (request: NextRequest) => {

  const data: {{ inputs.method | pascal }}{{ inputs.pathWithoutSlash | pascal }}['requestOptions']['query'] = await request.json();
  console.log(`${ {{ inputs.method | pascal }}ApiName} Started`, data);

  const result = await prisma.user
    .create({
      data,
    })
    .catch((e) => {
      console.error(e);
      console.error(`${ {{ inputs.method | pascal }}ApiName} Failed`);
    });

  console.log(`${ {{ inputs.method | pascal }}ApiName} Ended`, result);

  return Response.json({
    success: !!result,
    result,
  });
};
