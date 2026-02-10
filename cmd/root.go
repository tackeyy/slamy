package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var (
	outputJSON  bool
	outputPlain bool
)

var rootCmd = &cobra.Command{
	Use:   "slamy",
	Short: "Slack CLI tool",
	Long:  "slamy — A CLI tool for Slack operations. Designed for both human use and AI agent integration.",
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().BoolVar(&outputJSON, "json", false, "Output in JSON format")
	rootCmd.PersistentFlags().BoolVar(&outputPlain, "plain", false, "Output in TSV format")
}
