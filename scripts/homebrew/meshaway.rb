# typed: false
# frozen_string_literal: true

class Meshaway < Formula
  desc "Protocol bridge for agentic tools"
  homepage "https://github.com/offbeatport/meshaway"
  version "0.1.2"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/offbeatport/meshaway/releases/download/v0.1.2/meshaway-0.1.2-darwin-arm64.tar.gz"
      sha256 "fcc938abf8934319fd78500cbdf94ae0508c94f2bbd9ad51c2a1e6cd64a104b5"

      def install
        bin.install "meshaway"
      end
    end
    if Hardware::CPU.intel?
      url "https://github.com/offbeatport/meshaway/releases/download/v0.1.2/meshaway-0.1.2-darwin-x64.tar.gz"
      sha256 "44a8bb1c37dbad884fb327f0d1bc60cf56f748ca1b1372a299ce23eab8930f39"

      def install
        bin.install "meshaway"
      end
    end
  end

  on_linux do
    if Hardware::CPU.arm? && Hardware::CPU.is_64_bit?
      url "https://github.com/offbeatport/meshaway/releases/download/v0.1.2/meshaway-0.1.2-linux-arm64.tar.gz"
      sha256 "971b6b79da65080e9938716843e512c48f93677b9cbb76b92794285bba837cf2"

      def install
        bin.install "meshaway"
      end
    end
    if Hardware::CPU.intel? && Hardware::CPU.is_64_bit?
      url "https://github.com/offbeatport/meshaway/releases/download/v0.1.2/meshaway-0.1.2-linux-x64.tar.gz"
      sha256 "a0285d31f1706e0b55d5ed4966c3396131c68b2d923b34bb154306045eeb1b4f"

      def install
        bin.install "meshaway"
      end
    end
  end
  test do
    assert_match "meshaway", shell_output("#{bin}/meshaway --help")
  end
end
