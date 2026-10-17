# GitHub integration package
from github.client import github_client, GitHubClient, RepositoryInfo, PullRequestInfo, FileContent

__all__ = [
    "github_client",
    "GitHubClient",
    "RepositoryInfo",
    "PullRequestInfo",
    "FileContent",
]