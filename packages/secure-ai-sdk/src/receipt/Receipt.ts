export interface Receipt {
    receipt_id: string;
    timestamp_utc: string;
    provider: string;
    model: string;
    request_hash: string;
    response_hash: string;
    latency_ms: number;
    bot_id?: string;
    bot_version?: string;
    previous_receipt_hash?: string;
}
