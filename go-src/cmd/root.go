package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"

	slackutil "github.com/tackeyy/slamy/internal/slack"
)

var (
	version = "dev"
)

var (
	outputJSON  bool
	outputPlain bool
	workspace   string
)

var rootCmd = &cobra.Command{
	Use:     "slamy",
	Short:   "Slack CLI tool",
	Long:    "slamy — A CLI tool for Slack operations. Designed for both human use and AI agent integration.",
	Version: version,
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
	rootCmd.PersistentFlags().StringVar(&workspace, "workspace", "", "Slack workspace alias")
}

func newCommandClient() (*slackutil.Client, error) {
	if rootCmd.PersistentFlags().Changed("workspace") {
		return slackutil.NewClientForWorkspace(workspace)
	}
	return slackutil.NewClient()
}
