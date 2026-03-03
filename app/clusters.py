SKILL_CLUSTERS = {
    "programming_languages": ["java", "python", "c#", "javascript"],
    "crm_systems": ["salesforce", "hubspot"],
    "analytics_tools": ["tableau", "power bi"],
    "automation_tools": ["selenium", "cypress", "playwright", "restassured"],
    "testing_concepts": ["api testing", "automation testing", "manual testing"],
}


def build_cluster_index(clusters: dict[str, list[str]]) -> dict[str, str]:
    index: dict[str, str] = {}
    for cluster_name, skills in clusters.items():
        for skill in skills:
            index[skill.lower()] = cluster_name
    return index
