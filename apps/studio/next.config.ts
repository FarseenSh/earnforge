// SPDX-License-Identifier: Apache-2.0
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@earnforge/sdk'],
  webpack: (config, { webpack }) => {
    // wagmi connectors reference optional peer deps for connectors we don't use.
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^(@walletconnect\/ethereum-provider|@coinbase\/wallet-sdk|@metamask\/connect-evm|@base-org\/account|@safe-global\/safe-apps-sdk|@safe-global\/safe-apps-provider|porto|porto\/internal|bs58)$/,
      }),
    );
    return config;
  },
};

export default nextConfig;
