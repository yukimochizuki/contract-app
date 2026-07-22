import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

export async function listContracts(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const mock = [
        { contractId: "abc123", startDate: 1720000000000, endDate: 1750000000000, points: "5000" },
        { contractId: "xyz999", startDate: 1700000000000, endDate: 1730000000000, points: "7000" }
      ];
    
      return {
        jsonBody: mock
      };
};

app.http('listContracts', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: listContracts
});
