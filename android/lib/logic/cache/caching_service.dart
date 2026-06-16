import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:lectio_wrapper/lectio/student.dart';
import 'package:lectio_wrapper/types/context/team.dart';
import 'package:lectio_wrapper/types/gym.dart';
import 'package:lectio_wrapper/types/primitives/team.dart';
import 'package:shared_preferences/shared_preferences.dart';

const teamCachedDateKey = "teamCachedDate";
const teamCacheKey = "teamCache";
const gymNameKey = "gymName";

class CacheState {
  List<Team> teams;
  String gymName;
  CacheState(this.teams, this.gymName);
}

class CachingService {
  late SharedPreferences prefs;
  final Student student;
  final List<Gym> gyms;
  CachingService(this.student, this.gyms);

  bool _containsTeamCache() {
    return prefs.containsKey(teamCacheKey) &&
        prefs.containsKey(teamCachedDateKey);
  }

  FutureOr<List<Team>> _getSavedTeams(bool force) async {
    if (!force && _containsTeamCache()) {
      DateTime teamCachedDate =
          DateTime.parse(prefs.getString(teamCachedDateKey) ?? "");
      Duration timeSinceCache = DateTime.now().difference(teamCachedDate);
      if (timeSinceCache.inDays < 31) {
        return _fetchLocalTeams();
      }
    }
    return await _fetchTeams();
  }

  List<Team> _fetchLocalTeams() {
    var entries = prefs.getStringList(teamCacheKey)!;
    return entries.map((entry) => stringToTeam(entry)).toList();
  }

  Future<List<Team>> _fetchTeams() async {
    List<Team> teams = [];
    var teamsRef = await student.teams.list();
    for (var teamRef in teamsRef) {
      try {
        await Future.delayed(const Duration(milliseconds: 500));
        var teamContext =
            (await student.context.get("HE${teamRef.id}")) as TeamContext;
        teams.add(Team(
            name: teamRef.name,
            id: teamRef.id,
            displayName: teamContext.subject));
      } catch (e) {
        debugPrint("failed at ${teamRef.displayName}");
      }
    }
    prefs.setStringList(
        teamCacheKey, teams.map((team) => teamToString(team)).toList());
    prefs.setString(teamCachedDateKey, DateTime.now().toIso8601String());
    return teams;
  }

  String _getGymName() {
    if (prefs.containsKey(gymNameKey)) {
      return prefs.getString(gymNameKey)!;
    }
    var gymMatches = gyms.where((element) => element.id == student.gymId);
    if (gymMatches.isNotEmpty) {
      var gym = gymMatches.elementAt(0);
      prefs.setString(gymNameKey, gym.name);
      return gym.name;
    }
    return "";
  }

  Future<CacheState> loadSaved({bool forceTeams = false}) async {
    prefs = await SharedPreferences.getInstance();
    List<Team> teams = await _getSavedTeams(forceTeams);
    String gymName = _getGymName();
    return CacheState(teams, gymName);
  }

  Future<void> deleteAll() async {
    var lPrefs = await SharedPreferences.getInstance();
    await lPrefs.clear();
  }
}

String teamToString(Team team) {
  return "name=${team.name};id=${team.id};display=${team.displayName}";
}

Team stringToTeam(String team) {
  var topics = team.split(";");
  String name = "";
  String id = "";
  String display = "";
  for (var topic in topics) {
    var split = topic.split('=');
    switch (split[0]) {
      case 'name':
        name = split[1];
        break;
      case 'id':
        id = split[1];
        break;
      case 'display':
        display = split[1];
        break;
    }
  }
  return Team(name: name, id: id, displayName: display);
}
