# typed: false
# frozen_string_literal: true

class Meshaway < Formula
  desc "Protocol bridge for agentic tools"
  homepage "https://github.com/offbeatport/meshaway"
  version "0.1.1"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/offbeatport/meshaway/releases/download/v0.1.1/meshaway-0.1.1-darwin-arm64.tar.gz"
      sha256 "ff9fc5f8570fb2f4b6804476a078f525b3e6edef89c686244af42e381899a477"

      def install
        bin.install "meshaway"
      end
    end
    if Hardware::CPU.intel?
      url "https://github.com/offbeatport/meshaway/releases/download/v0.1.1/meshaway-0.1.1-darwin-x64.tar.gz"
      sha256 "b84d9d14d0b59de38c20f1c33e82585693f1d4ee11374324254f26404107dd1c"

      def install
        bin.install "meshaway"
      end
    end
  end

  on_linux do
    if Hardware::CPU.arm? && Hardware::CPU.is_64_bit?
      url "https://github.com/offbeatport/meshaway/releases/download/v0.1.1/meshaway-0.1.1-linux-arm64.tar.gz"
      sha256 "000394ba68d5e469a9e7300991184c1f9ae652ca518164875f38647734e07e73"

      def install
        bin.install "meshaway"
      end
    end
    if Hardware::CPU.intel? && Hardware::CPU.is_64_bit?
      url "https://github.com/offbeatport/meshaway/releases/download/v0.1.1/meshaway-0.1.1-linux-x64.tar.gz"
      sha256 "e0fcae41692c37beee6b6895378cd32e4bb33d2637c8ed876ff8682c81247c9b"

      def install
        bin.install "meshaway"
      end
    end
  end
  test do
    assert_match "meshaway", shell_output("#{bin}/meshaway --help")
  end
end
