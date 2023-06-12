import { 
  Metaplex, 
  bundlrStorage, 
  keypairIdentity, 
  toMetaplexFile 
} from "@metaplex-foundation/js"
import { 
  DataV2,
  createCreateMetadataAccountV3Instruction
} from "@metaplex-foundation/mpl-token-metadata"
import * as fs from "fs"
import { initializeKeypair } from "./initializeKeypair"
import {
  Connection,
  Keypair,
  PublicKey,
  ConfirmOptions,
  sendAndConfirmTransaction,
  clusterApiUrl,
  Transaction
} from "@solana/web3.js"
import {
  Account,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
  createAssociatedTokenAccountInstruction,
  createMint,
  getAccount,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  mintToChecked
} from "@solana/spl-token"

async function createNewMint(
  connection: Connection,
  payer: Keypair,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey | null,
  decimals: number,
  keypair: Keypair,
  confirmOptions: ConfirmOptions
): Promise<PublicKey> {
  
  const tokenMint = await createMint(
    connection,
    payer,
    mintAuthority,
    freezeAuthority,
    decimals,
    keypair,
    confirmOptions
  )

  console.log(`Token Mint: https://explorer.solana.com/address/${tokenMint}?cluster=devnet`)

  return tokenMint;
}

async function createTokenMetadata(
  connection: Connection,
  metaplex: Metaplex,
  mint: PublicKey,
  user: Keypair,
  name: string,
  symbol: string,
  description: string
) {
  // file to buffer
  const buffer = fs.readFileSync("assets/pirate.webp")

  // buffer to metaplex file
  const file = toMetaplexFile(buffer, "pirate.webp")

  // upload image and get image uri
  const imageURI = await metaplex.storage().upload(file)
  console.log(`Image URI: ${imageURI}`)

  // upload metadata and get metadata uri (off chain metadata)
  const { uri } = await metaplex
    .nfts()
    .uploadMetadata({
      name: name,
      description: description,
      image: imageURI
    })
  console.log(`Metadata URI: ${uri}`)

  // get metadata account address 
  const metadataPDA = metaplex.nfts().pdas().metadata({mint})

  // onchain metadata format
  const tokenMetadata = {
    name: name,
    symbol: symbol,
    uri: uri,
    sellerFeeBasisPoints: 0,
    creators: null,
    collection: null,
    uses: null
  } as DataV2

  // transaction to create metadata account
  const transaction = new Transaction().add(
    createCreateMetadataAccountV3Instruction(
      {
        metadata: metadataPDA,
        mint: mint,
        mintAuthority: user.publicKey,
        payer: user.publicKey,
        updateAuthority: user.publicKey
      },
      {
        createMetadataAccountArgsV3: {
          data: tokenMetadata,
          isMutable: true,
          collectionDetails: null
        }
      }
    )
  )

  // send transaction
  const transactionSignature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [user]
  )

  console.log(`Metadata Account: https://explorer.solana.com/tx/${transactionSignature}?cluster=devnet`)
}

async function main() {
  const connection = new Connection(clusterApiUrl("devnet"), {commitment:"confirmed"})
  const user = await initializeKeypair(connection)

  console.log("Public Key:", user.publicKey.toBase58())

  const mintKeypair = Keypair.generate()
  
  const mintTx = await createNewMint(
    connection,
    user,
    user.publicKey,
    user.publicKey,
    2,
    mintKeypair,
    {commitment:"confirmed"}
  )

  const metaplex = Metaplex.make(connection)
    .use(keypairIdentity(user))
    .use(
      bundlrStorage({
        address: "https://devnet.bundlr.network",
        providerUrl: "https://api.devnet.solana.com",
        timeout: 60000
      })
    )
  
  await createTokenMetadata(
    connection,
    metaplex,
    new PublicKey(mintTx),
    user,
    "Pirate",
    "PIR",
    "Arghh matey, pirates aboard"
  )

  // const tokenATA = await getAssociatedTokenAddress(
  //   mintKeypair.publicKey,
  //   user.publicKey
  // )

  // let tokenAccount: Account
  // try {
  //   // Check if token account already exists
  //   tokenAccount = await getAccount(
  //     connection,
  //     tokenATA,
  //     "confirmed"
  //   )
  // } catch (error) {
  //   if (
  //     error instanceof TokenAccountNotFoundError ||
  //     error instanceof TokenInvalidAccountOwnerError
  //   ) {
  //     try {
  //       // add instruction to create token account if one does not exist
  //       const tx = new Transaction().add(
  //         createAssociatedTokenAccountInstruction(
  //           user.publicKey,
  //           tokenATA,
  //           user.publicKey,
  //           mintKeypair.publicKey
  //         )
  //       )

  //       await sendAndConfirmTransaction(connection, tx, [user], {commitment:"confirmed"})
  //     } catch (error: unknown) {

  //     }
  //     tokenAccount = await getAccount(connection, tokenATA, "confirmed")
  //   } else {
  //     throw error
  //   }
  // }

  const tokenAccount = await getOrCreateAssociatedTokenAccount(connection, user, mintKeypair.publicKey, user.publicKey, false, "confirmed")

  const txhash = await mintToChecked(
    connection,
    user,
    mintKeypair.publicKey,
    tokenAccount.address,
    user,
    100,
    2
  )

  console.log(`Transaction: https://explorer.solana.com/tx/${txhash}?cluster=devnet`)
}
  
main()
  .then(() => {
    console.log("Finished successfully")
    process.exit(0)
  })
  .catch((error) => {
    console.log(error)
    process.exit(1)
  })
  