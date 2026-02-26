# typed: false
# frozen_string_literal: true

class Meshaway < Formula
  desc "Protocol bridge for agentic tools"
  homepage "https://github.com/offbeatport/meshaway"
  version "0.1.3"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/offbeatport/meshaway/releases/download/v0.1.3/meshaway-0.1.3-darwin-arm64.tar.gz"
      sha256 "4602791641bde4b87700431d52cce4fb85f618dc44be04d363d5b93f4cb57bec"

      def install
        bin.install "meshaway"
      end
    end
    if Hardware::CPU.intel?
      url "https://github.com/offbeatport/meshaway/releases/download/v0.1.3/meshaway-0.1.3-darwin-x64.tar.gz"
      sha256 "f21b5e9edb070b1828be84001028f8fa564a9db9bc00f11b491dcfb6e4ee3099"

      def install
        bin.install "meshaway"
      end
    end
  end

  on_linux do
    if Hardware::CPU.arm? && Hardware::CPU.is_64_bit?
      url "https://github.com/offbeatport/meshaway/releases/download/v0.1.3/meshaway-0.1.3-linux-arm64.tar.gz"
      sha256 "b7f45aa1a7632f3bb07bef4f7c934c7b42740d0bc54982e6d76610324816f2cd"

      def install
        bin.install "meshaway"
      end
    end
    if Hardware::CPU.intel? && Hardware::CPU.is_64_bit?
      url "https://github.com/offbeatport/meshaway/releases/download/v0.1.3/meshaway-0.1.3-linux-x64.tar.gz"
      sha256 "9883ee0e6b67cb0312bea8284e6af8961c8d37427bf9901e6b4006b9cc0f2cd4"

      def install
        bin.install "meshaway"
      end
    end
  end
  test do
    assert_match "meshaway", shell_output("#{bin}/meshaway --help")
  end
end
