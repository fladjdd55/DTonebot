import type * as types from './types';
import type { ConfigOptions, FetchResponse } from 'api/dist/core'
import Oas from 'oas';
import APICore from 'api/dist/core';
import definition from './openapi.json';

class SDK {
  spec: Oas;
  core: APICore;

  constructor() {
    this.spec = Oas.init(definition);
    this.core = new APICore(this.spec, 'dtone/1.22.0 (api/6.1.3)');
  }

  /**
   * Optionally configure various options that the SDK allows.
   *
   * @param config Object of supported SDK options and toggles.
   * @param config.timeout Override the default `fetch` request timeout of 30 seconds. This number
   * should be represented in milliseconds.
   */
  config(config: ConfigOptions) {
    this.core.setConfig(config);
  }

  /**
   * If the API you're using requires authentication you can supply the required credentials
   * through this method and the library will magically determine how they should be used
   * within your API request.
   *
   * With the exception of OpenID and MutualTLS, it supports all forms of authentication
   * supported by the OpenAPI specification.
   *
   * @example <caption>HTTP Basic auth</caption>
   * sdk.auth('username', 'password');
   *
   * @example <caption>Bearer tokens (HTTP or OAuth 2)</caption>
   * sdk.auth('myBearerToken');
   *
   * @example <caption>API Keys</caption>
   * sdk.auth('myApiKey');
   *
   * @see {@link https://spec.openapis.org/oas/v3.0.3#fixed-fields-22}
   * @see {@link https://spec.openapis.org/oas/v3.1.0#fixed-fields-22}
   * @param values Your auth credentials for the API; can specify up to two strings or numbers.
   */
  auth(...values: string[] | number[]) {
    this.core.setAuth(...values);
    return this;
  }

  /**
   * If the API you're using offers alternate server URLs, and server variables, you can tell
   * the SDK which one to use with this method. To use it you can supply either one of the
   * server URLs that are contained within the OpenAPI definition (along with any server
   * variables), or you can pass it a fully qualified URL to use (that may or may not exist
   * within the OpenAPI definition).
   *
   * @example <caption>Server URL with server variables</caption>
   * sdk.server('https://{region}.api.example.com/{basePath}', {
   *   name: 'eu',
   *   basePath: 'v14',
   * });
   *
   * @example <caption>Fully qualified server URL</caption>
   * sdk.server('https://eu.api.example.com/v14');
   *
   * @param url Server URL
   * @param variables An object of variables to replace into the server URL.
   */
  server(url: string, variables = {}) {
    this.core.setServer(url, variables);
  }

  /**
   * Retrieve list of services
   *
   */
  getServices(metadata?: types.GetServicesMetadataParam): Promise<FetchResponse<200, types.GetServicesResponse200> | FetchResponse<number, types.GetServicesResponseDefault>> {
    return this.core.fetch('/services', 'get', metadata);
  }

  /**
   * Retrieve service by ID
   *
   * @throws FetchError<404, types.GetServiceByIdResponse404> Service not found
   */
  getServiceById(metadata: types.GetServiceByIdMetadataParam): Promise<FetchResponse<200, types.GetServiceByIdResponse200> | FetchResponse<number, types.GetServiceByIdResponseDefault>> {
    return this.core.fetch('/services/{service_id}', 'get', metadata);
  }

  /**
   * Retrieve list of countries
   *
   */
  getCountries(metadata?: types.GetCountriesMetadataParam): Promise<FetchResponse<200, types.GetCountriesResponse200> | FetchResponse<number, types.GetCountriesResponseDefault>> {
    return this.core.fetch('/countries', 'get', metadata);
  }

  /**
   * Retrieve country by ISO code
   *
   * @throws FetchError<404, types.GetCountryByIsoCodeResponse404> Country not found
   */
  getCountryByIsoCode(metadata: types.GetCountryByIsoCodeMetadataParam): Promise<FetchResponse<200, types.GetCountryByIsoCodeResponse200> | FetchResponse<number, types.GetCountryByIsoCodeResponseDefault>> {
    return this.core.fetch('/countries/{country_iso_code}', 'get', metadata);
  }

  /**
   * Retrieve list of operators
   *
   */
  getOperators(metadata?: types.GetOperatorsMetadataParam): Promise<FetchResponse<200, types.GetOperatorsResponse200> | FetchResponse<number, types.GetOperatorsResponseDefault>> {
    return this.core.fetch('/operators', 'get', metadata);
  }

  /**
   * Retrieve operator by ID
   *
   * @throws FetchError<404, types.GetOperatorByIdResponse404> Operator not found
   */
  getOperatorById(metadata: types.GetOperatorByIdMetadataParam): Promise<FetchResponse<200, types.GetOperatorByIdResponse200> | FetchResponse<number, types.GetOperatorByIdResponseDefault>> {
    return this.core.fetch('/operators/{operator_id}', 'get', metadata);
  }

  /**
   * Retrieve list of benefit types
   *
   */
  getBenefitTypes(metadata?: types.GetBenefitTypesMetadataParam): Promise<FetchResponse<200, types.GetBenefitTypesResponse200> | FetchResponse<number, types.GetBenefitTypesResponseDefault>> {
    return this.core.fetch('/benefit-types', 'get', metadata);
  }

  /**
   * Retrieve list of promotions
   *
   */
  getPromotions(metadata?: types.GetPromotionsMetadataParam): Promise<FetchResponse<200, types.GetPromotionsResponse200> | FetchResponse<number, types.GetPromotionsResponseDefault>> {
    return this.core.fetch('/promotions', 'get', metadata);
  }

  /**
   * Retrieve promotion by ID
   *
   * @throws FetchError<404, types.GetPromotionByIdResponse404> Promotion not found
   */
  getPromotionById(metadata: types.GetPromotionByIdMetadataParam): Promise<FetchResponse<200, types.GetPromotionByIdResponse200> | FetchResponse<number, types.GetPromotionByIdResponseDefault>> {
    return this.core.fetch('/promotions/{promotion_id}', 'get', metadata);
  }

  /**
   * Retrieve list of active campaigns
   *
   */
  getCampaigns(metadata?: types.GetCampaignsMetadataParam): Promise<FetchResponse<200, types.GetCampaignsResponse200> | FetchResponse<number, types.GetCampaignsResponseDefault>> {
    return this.core.fetch('/campaigns', 'get', metadata);
  }

  /**
   * Retrieve campaign by ID
   *
   * @throws FetchError<404, types.GetCampaignByIdResponse404> Campaign not found
   */
  getCampaignById(metadata: types.GetCampaignByIdMetadataParam): Promise<FetchResponse<200, types.GetCampaignByIdResponse200> | FetchResponse<number, types.GetCampaignByIdResponseDefault>> {
    return this.core.fetch('/campaigns/{campaign_id}', 'get', metadata);
  }

  /**
   * Retrieve a paginated list of products with optional filtering and sorting.
   *
   * **Available sort fields:**
   * - `id`: Product ID
   * - `name`: Product name  
   * - `amount`: Destination Amount
   *
   * @summary Retrieve list of products
   */
  getProducts(metadata?: types.GetProductsMetadataParam): Promise<FetchResponse<200, types.GetProductsResponse200> | FetchResponse<number, types.GetProductsResponseDefault>> {
    return this.core.fetch('/products', 'get', metadata);
  }

  /**
   * Retrieve product by ID
   *
   * @throws FetchError<404, types.GetProductByIdResponse404> Product not found
   */
  getProductById(metadata: types.GetProductByIdMetadataParam): Promise<FetchResponse<200, types.GetProductByIdResponse200> | FetchResponse<number, types.GetProductByIdResponseDefault>> {
    return this.core.fetch('/products/{product_id}', 'get', metadata);
  }

  /**
   * Two transaction modes (asynchronous and synchronous) are available. This endpoint lets
   * you create a transaction in the **asynchronous** mode. Note that the `auto_confirm` flag
   * can be set to simultaneously create and confirm a transaction in one step (i.e. HTTP
   * request).
   *
   * @summary Create a transaction asynchronously
   */
  postTransactionAsync(body: types.PostTransactionAsyncBodyParam): Promise<FetchResponse<201, types.PostTransactionAsyncResponse201> | FetchResponse<number, types.PostTransactionAsyncResponseDefault>> {
    return this.core.fetch('/async/transactions', 'post', body);
  }

  /**
   * Two transaction modes (asynchronous and synchronous) are available. This endpoint lets
   * you create a transaction in the **synchronous** mode. Note that the `auto_confirm` flag
   * can be set to simultaneously create and confirm a transaction in one step (i.e. HTTP
   * request).
   *
   * @summary Create a transaction synchronously
   */
  postTransactionSync(body: types.PostTransactionSyncBodyParam): Promise<FetchResponse<201, types.PostTransactionSyncResponse201> | FetchResponse<number, types.PostTransactionSyncResponseDefault>> {
    return this.core.fetch('/sync/transactions', 'post', body);
  }

  /**
   * This endpoint will return the details of the requested transaction.
   *
   * @summary Query a transaction by ID
   * @throws FetchError<404, types.GetTransactionByIdResponse404> Transaction not found
   */
  getTransactionById(metadata: types.GetTransactionByIdMetadataParam): Promise<FetchResponse<200, types.GetTransactionByIdResponse200> | FetchResponse<number, types.GetTransactionByIdResponseDefault>> {
    return this.core.fetch('/transactions/{transaction_id}', 'get', metadata);
  }

  /**
   * This endpoint will return a list of transactions matching the search criteria. Please
   * note that when this endpoint is called without any parameters and/or if neither date
   * ranges (i.e. `from_date`, `to_date`) nor `external_id` are specified, transactions
   * created within the last 24 hours will be returned by default.
   *
   * @summary Query list of transactions
   * @throws FetchError<404, types.GetTransactionsResponse404> Transaction not found
   */
  getTransactions(metadata?: types.GetTransactionsMetadataParam): Promise<FetchResponse<200, types.GetTransactionsResponse200> | FetchResponse<number, types.GetTransactionsResponseDefault>> {
    return this.core.fetch('/transactions', 'get', metadata);
  }

  /**
   * If an **asynchronous** transaction was created without setting the `auto_confirm` flag,
   * this endpoint will have to be called to confirm the transaction. Once successfully
   * confirmed, the transfer order will be submitted to the operator to be processed.
   *
   * Please note that only unexpired transactions can be confirmed, as denoted in the
   * `confirmation_expiration_date` field of the transaction. Beyond this, the only allowed
   * change is to [cancel the
   * transaction](/#tag/Transactions/paths/~1transactions~1{transaction_id}~1cancel/post), so
   * as to release the held balance.
   *
   * @summary Confirm a transaction asynchronously
   */
  postTransactionConfirmAsync(metadata: types.PostTransactionConfirmAsyncMetadataParam): Promise<FetchResponse<202, types.PostTransactionConfirmAsyncResponse202> | FetchResponse<number, types.PostTransactionConfirmAsyncResponseDefault>> {
    return this.core.fetch('/async/transactions/{transaction_id}/confirm', 'post', metadata);
  }

  /**
   * If a **synchronous** transaction was created without setting the `auto_confirm` flag,
   * this endpoint will have to be called to confirm the transaction. Once successfully
   * confirmed, the transfer order will be submitted to the operator to be processed.
   *
   * Please note that only unexpired transactions can be confirmed, as denoted in the
   * `confirmation_expiration_date` field of the transaction. Beyond this, the only allowed
   * change is to [cancel the
   * transaction](/#tag/Transactions/paths/~1transactions~1{transaction_id}~1cancel/post), so
   * as to release the held balance.
   *
   * @summary Confirm a transaction synchronously
   */
  postTransactionConfirmSync(metadata: types.PostTransactionConfirmSyncMetadataParam): Promise<FetchResponse<202, types.PostTransactionConfirmSyncResponse202> | FetchResponse<number, types.PostTransactionConfirmSyncResponseDefault>> {
    return this.core.fetch('/sync/transactions/{transaction_id}/confirm', 'post', metadata);
  }

  /**
   * If a transaction is still in the `CREATED` state, it has not yet been submitted to the
   * receiving operator for processing. You can thus request to cancel such transactions by
   * calling this endpoint.
   *
   * @summary Cancel a transaction
   */
  postTransactionCancel(metadata: types.PostTransactionCancelMetadataParam): Promise<FetchResponse<202, types.PostTransactionCancelResponse202> | FetchResponse<number, types.PostTransactionCancelResponseDefault>> {
    return this.core.fetch('/transactions/{transaction_id}/cancel', 'post', metadata);
  }

  /**
   * Retrieve balances
   *
   */
  getBalances(metadata?: types.GetBalancesMetadataParam): Promise<FetchResponse<200, types.GetBalancesResponse200> | FetchResponse<number, types.GetBalancesResponseDefault>> {
    return this.core.fetch('/balances', 'get', metadata);
  }

  /**
   * Look up operators for a given mobile number
   *
   */
  postLookupMobileNumber(body: types.PostLookupMobileNumberBodyParam): Promise<FetchResponse<200, types.PostLookupMobileNumberResponse200> | FetchResponse<number, types.PostLookupMobileNumberResponseDefault>> {
    return this.core.fetch('/lookup/mobile-number', 'post', body);
  }

  /**
   * Look up operators for a given mobile number
   *
   */
  getLookupMobileNumber(metadata: types.GetLookupMobileNumberMetadataParam): Promise<FetchResponse<200, types.GetLookupMobileNumberResponse200> | FetchResponse<number, types.GetLookupMobileNumberResponseDefault>> {
    return this.core.fetch('/lookup/mobile-number/{mobile_number}', 'get', metadata);
  }

  /**
   * Inquire statements for a given account number
   *
   */
  postLookupStatementInquiry(body: types.PostLookupStatementInquiryBodyParam): Promise<FetchResponse<200, types.PostLookupStatementInquiryResponse200> | FetchResponse<number, types.PostLookupStatementInquiryResponseDefault>> {
    return this.core.fetch('/lookup/statement-inquiry', 'post', body);
  }

  /**
   * Retrieve remaining product benefits for a given credit party
   *
   */
  postLookupCreditPartyBenefits(body: types.PostLookupCreditPartyBenefitsBodyParam): Promise<FetchResponse<200, types.PostLookupCreditPartyBenefitsResponse200> | FetchResponse<number, types.PostLookupCreditPartyBenefitsResponseDefault>> {
    return this.core.fetch('/lookup/credit-party-benefits', 'post', body);
  }

  /**
   * Retrieve status for a given credit party
   *
   */
  postLookupCreditPartyStatus(body: types.PostLookupCreditPartyStatusBodyParam): Promise<FetchResponse<200, types.PostLookupCreditPartyStatusResponse200> | FetchResponse<number, types.PostLookupCreditPartyStatusResponseDefault>> {
    return this.core.fetch('/lookup/credit-party-status', 'post', body);
  }
}

const createSDK = (() => { return new SDK(); })()
;

export default createSDK;

export type { GetBalancesMetadataParam, GetBalancesResponse200, GetBalancesResponseDefault, GetBenefitTypesMetadataParam, GetBenefitTypesResponse200, GetBenefitTypesResponseDefault, GetCampaignByIdMetadataParam, GetCampaignByIdResponse200, GetCampaignByIdResponse404, GetCampaignByIdResponseDefault, GetCampaignsMetadataParam, GetCampaignsResponse200, GetCampaignsResponseDefault, GetCountriesMetadataParam, GetCountriesResponse200, GetCountriesResponseDefault, GetCountryByIsoCodeMetadataParam, GetCountryByIsoCodeResponse200, GetCountryByIsoCodeResponse404, GetCountryByIsoCodeResponseDefault, GetLookupMobileNumberMetadataParam, GetLookupMobileNumberResponse200, GetLookupMobileNumberResponseDefault, GetOperatorByIdMetadataParam, GetOperatorByIdResponse200, GetOperatorByIdResponse404, GetOperatorByIdResponseDefault, GetOperatorsMetadataParam, GetOperatorsResponse200, GetOperatorsResponseDefault, GetProductByIdMetadataParam, GetProductByIdResponse200, GetProductByIdResponse404, GetProductByIdResponseDefault, GetProductsMetadataParam, GetProductsResponse200, GetProductsResponseDefault, GetPromotionByIdMetadataParam, GetPromotionByIdResponse200, GetPromotionByIdResponse404, GetPromotionByIdResponseDefault, GetPromotionsMetadataParam, GetPromotionsResponse200, GetPromotionsResponseDefault, GetServiceByIdMetadataParam, GetServiceByIdResponse200, GetServiceByIdResponse404, GetServiceByIdResponseDefault, GetServicesMetadataParam, GetServicesResponse200, GetServicesResponseDefault, GetTransactionByIdMetadataParam, GetTransactionByIdResponse200, GetTransactionByIdResponse404, GetTransactionByIdResponseDefault, GetTransactionsMetadataParam, GetTransactionsResponse200, GetTransactionsResponse404, GetTransactionsResponseDefault, PostLookupCreditPartyBenefitsBodyParam, PostLookupCreditPartyBenefitsResponse200, PostLookupCreditPartyBenefitsResponseDefault, PostLookupCreditPartyStatusBodyParam, PostLookupCreditPartyStatusResponse200, PostLookupCreditPartyStatusResponseDefault, PostLookupMobileNumberBodyParam, PostLookupMobileNumberResponse200, PostLookupMobileNumberResponseDefault, PostLookupStatementInquiryBodyParam, PostLookupStatementInquiryResponse200, PostLookupStatementInquiryResponseDefault, PostTransactionAsyncBodyParam, PostTransactionAsyncResponse201, PostTransactionAsyncResponseDefault, PostTransactionCancelMetadataParam, PostTransactionCancelResponse202, PostTransactionCancelResponseDefault, PostTransactionConfirmAsyncMetadataParam, PostTransactionConfirmAsyncResponse202, PostTransactionConfirmAsyncResponseDefault, PostTransactionConfirmSyncMetadataParam, PostTransactionConfirmSyncResponse202, PostTransactionConfirmSyncResponseDefault, PostTransactionSyncBodyParam, PostTransactionSyncResponse201, PostTransactionSyncResponseDefault } from './types';
