# typed: false
# frozen_string_literal: true

class Meshaway < Formula
  desc "Protocol bridge for agentic tools"
  homepage "https://github.com/offbeatport/meshaway"
  version "0.1.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/offbeatport/meshaway/releases/download/v0.1.0/meshaway-0.1.0-darwin-arm64.tar.gz"
      sha256 "44e3fed42f8a26452237e1ceda02ec253e1f0f7fbb94e78e3ac1b0d575f3df19"

      def install
        bin.install "meshaway"
      end
    end
    if Hardware::CPU.intel?
      url "https://github.com/offbeatport/meshaway/releases/download/v0.1.0/meshaway-0.1.0-darwin-x64.tar.gz"
      sha256 "ee5eb5b443db7e04c73ed8ba70a4e034b68b5d1375c5299661083c69d19a12c1"

      def install
        bin.install "meshaway"
      end
    end
  end

  on_linux do
    if Hardware::CPU.arm? && Hardware::CPU.is_64_bit?
      url "https://github.com/offbeatport/meshaway/releases/download/v0.1.0/meshaway-0.1.0-linux-arm64.tar.gz"
      sha256 "6c19e7e59aa2c0a3c5c5859d8445b55220e54e3ec1208a795ba53b5ce0cd1fd8"

      def install
        bin.install "meshaway"
      end
    end
    if Hardware::CPU.intel? && Hardware::CPU.is_64_bit?
      url "https://github.com/offbeatport/meshaway/releases/download/v0.1.0/meshaway-0.1.0-linux-x64.tar.gz"
      sha256 "dcde315e214ea3844e398df3d32d3e6edef8f2565f79b079e4bde1cf244cec23"

      def install
        bin.install "meshaway"
      end
    end
  end
  test do
    assert_match "meshaway", shell_output("#{bin}/meshaway --help")
  end
end
