"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { formatWalletAddress } from "@/utils/wallet";
import { Transaction } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useSearchParams } from "next/navigation";
import { execute } from "@/actions/execute";
import { deposit, depositInDatabase } from "@/actions/vault";
import { toast } from "sonner";

type TokenBalance = {
  mint: string;
  amount: number;
  decimals: number;
};

type TipContentProps = {
  receiverVault?: string;
};

const mintAddress = process.env.NEXT_PUBLIC_USDC_MINT_ADDRESS || "";

export function TipContent({ receiverVault }: TipContentProps) {
  const searchParams = useSearchParams();
  const [tokenBalance, setTokenBalance] = useState<TokenBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

  const { connection } = useConnection();
  const { publicKey, connected, signTransaction } = useWallet();

  const amount = Number(searchParams.get("amount") || 0);
  const receiverUsername = searchParams.get("receiver_username");
  const receiverDiscordId = searchParams.get("receiver_user_id");

  const hasBalance = useCallback(() => {
    const balanceAmount = Number(tokenBalance?.amount) || 0;
    return amount > balanceAmount ? false : true;
  }, [searchParams, tokenBalance]);

  const fetchTokenBalance = useCallback(async () => {
    if (isFetchingRef.current || !publicKey || !connected || !connection)
      return;
    try {
      isFetchingRef.current = true;
      setLoading(true);
      setError(null);

      const accounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        {
          programId: TOKEN_PROGRAM_ID,
        }
      );

      const specificTokenAccount = accounts.value.find(
        (account) => account.account.data.parsed.info.mint === mintAddress
      );

      if (specificTokenAccount) {
        const parsedInfo = specificTokenAccount.account.data.parsed.info;
        setTokenBalance({
          mint: parsedInfo.mint,
          amount: parsedInfo.tokenAmount.uiAmount,
          decimals: parsedInfo.tokenAmount.decimals,
        });
      } else {
        setTokenBalance(null);
        setError("Required token not found in wallet.");
      }
    } catch (err) {
      console.error(err);
      setError("Error fetching token balance");
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, [publicKey, connected, connection]);

  async function onSubmit() {
    if (!connection || !publicKey || !signTransaction) {
      console.log("Please connect your wallet.");
      return;
    }
    if (!receiverDiscordId) {
      console.log("Receiver Id is required.");
      return;
    }

    try {
      setLoading(true);
      const depositRes = await deposit({
        payer: publicKey.toString(),
        vaultId: receiverVault || undefined,
        strategy: "blockhash",
        network: "mainnet",
        amount,
        token: {
          mintAddress,
          amount,
        },
      });

      const transaction = Transaction.from(
        Buffer.from(depositRes.serializedTransaction, "base64")
      );
      const signedTransaction = await signTransaction(transaction);

      const { txHash } = await execute({
        vaultId: depositRes.vaultId,
        transactionId: depositRes.transactionId,
        signedTransaction: signedTransaction.serialize().toString("base64"),
      });

      await depositInDatabase({
        amount,
        vaultId: depositRes.vaultId,
        discordUserId: receiverDiscordId,
      });

      toast(
        <div className="flex flex-col gap-1">
          <span className="text-lg font-semibold">Transaction Confirmed</span>
          <span>Successfully tipped @{receiverUsername}</span>
          <a
            href={`https://solscan.io/tx/${txHash}`}
            target="_blank"
            className="underline"
            rel="noreferrer"
          >
            View transaction
          </a>
        </div>,
        { duration: 10000 }
      );
      setLoading(false);
    } catch {
      setLoading(false);
      toast.error("An error occurred on transaction. Try again.");
    }
  }

  useEffect(() => {
    fetchTokenBalance();
  }, [fetchTokenBalance]);

  if (!connected) {
    return (
      <div className="w-full max-w-md">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Tip @{receiverUsername}</h1>
          <h1 className="text-lg font-medium">Connect your wallet first</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold">Tip @{receiverUsername}</h1>
        <p className="mt-2 flex items-center text-gray-300">
          Connect your Solana wallet to tip
          <span className="flex items-center gap-0.5 mx-1">
            <img
              src="https://wsrv.nl/?w=128&h=128&default=1&url=https%3A%2F%2Fraw.githubusercontent.com%2Fsolana-labs%2Ftoken-list%2Fmain%2Fassets%2Fmainnet%2FEPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v%2Flogo.png"
              className="size-4"
            />
            <span className="font-semibold underline">{amount} USDC</span>
          </span>{" "}
          <span>to @{receiverUsername}</span>
        </p>
      </div>

      {!connected && (
        <div className="text-center p-8 border-2 border-dashed border-gray-300 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Connect Your Wallet</h2>
          <p className="mb-6 text-gray-500">
            Use the wallet button in the top right to connect your Solana
            wallet.
          </p>
          <p className="text-sm text-gray-500">
            We will check your balance of the required token.
          </p>
        </div>
      )}

      <div className="bg-gray-100 p-6 rounded-lg shadow mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-lg text-black">Wallet Connected</h2>
          <span className="text-sm text-gray-500">
            {formatWalletAddress(publicKey?.toString() || "")}
          </span>
        </div>
        <div>
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-black">Current Balance:</h3>
            <div className="text-lg font-semibold text-black">
              <span className="flex items-center gap-0.5 mx-1">
                <img
                  src="https://wsrv.nl/?w=128&h=128&default=1&url=https%3A%2F%2Fraw.githubusercontent.com%2Fsolana-labs%2Ftoken-list%2Fmain%2Fassets%2Fmainnet%2FEPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v%2Flogo.png"
                  className="size-4"
                />
                <span>
                  {tokenBalance?.amount.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: tokenBalance.decimals || 6,
                  }) || 0}{" "}
                  USDC
                </span>
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-200">
            <div className="flex justify-between items-center text-black">
              <span>Required Balance:</span>
              <div>
                <span className="flex items-center gap-0.5 mx-1">
                  <img
                    src="https://wsrv.nl/?w=128&h=128&default=1&url=https%3A%2F%2Fraw.githubusercontent.com%2Fsolana-labs%2Ftoken-list%2Fmain%2Fassets%2Fmainnet%2FEPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v%2Flogo.png"
                    className="size-4"
                  />
                  <span>{amount} USDC</span>
                </span>
              </div>
            </div>
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mt-4 mb-0">
                {error}
              </div>
            )}
          </div>

          <button
            className="w-full mt-6 px-4 py-4 bg-violet-500 text-white rounded hover:bg-violet-600 cursor-pointer disabled:cursor-not-allowed disabled:bg-zinc-500"
            onClick={onSubmit}
            disabled={!!error || loading || !hasBalance()}
          >
            {loading ? (
              <span>Loading...</span>
            ) : !hasBalance() ? (
              <span>Insufficient Balance</span>
            ) : (
              <div className="flex items-center justify-center font-semibold ">
                <span>Send</span>
                <span className="flex items-center gap-0.5 mx-1">
                  <img
                    src="https://wsrv.nl/?w=128&h=128&default=1&url=https%3A%2F%2Fraw.githubusercontent.com%2Fsolana-labs%2Ftoken-list%2Fmain%2Fassets%2Fmainnet%2FEPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v%2Flogo.png"
                    className="size-4"
                  />
                  <span className="underline">{amount} USDC</span>
                </span>
              </div>
            )}
          </button>
        </div>
      </div>
      <div className="text-sm text-white/80 text-center">
        <p className="mt-2 text-xs text-gray-400">
          You&apos;ll need to sign a message to prove wallet ownership.
        </p>
      </div>
    </div>
  );
}
