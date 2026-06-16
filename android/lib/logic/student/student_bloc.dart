import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/lectio/basic_info.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';
import 'package:lectio_wrapper/topics/gyms/controller.dart';
import 'package:lectio_wrapper/types/gym.dart';
import 'package:lectio_wrapper/types/primitives/team.dart';
import 'package:lectio_wrapper/utils/dio_client.dart';
import 'package:betterlectio/logic/cache/caching_service.dart';
import 'package:betterlectio/logic/cache/login_service.dart';

enum StudentStates {
  unauthorized,
  loading,
  authorized,
  loginError,
  internetError,
  unilogin,
  mitIDError
}

enum LoadingStates { caching, normal }

class StudentState {
  Student? student;
  BasicInfo? basicInfo;
  StudentStates state;
  List<Gym> gyms;
  List<Team> teams;
  LoadingStates loadingState;
  String gymName;
  Account? account;

  StudentState copyWith(
      {Student? student,
      BasicInfo? basicInfo,
      StudentStates? state,
      List<Gym>? gyms,
      LoadingStates? loadingState,
      List<Team>? teams,
      String? gymName,
      Account? account}) {
    return StudentState(
      state ?? this.state,
      gyms: gyms ?? this.gyms,
      basicInfo: basicInfo ?? this.basicInfo,
      student: student ?? this.student,
      loadingState: loadingState ?? this.loadingState,
      teams: teams ?? this.teams,
      gymName: gymName ?? this.gymName,
      account: account ?? this.account,
    );
  }

  StudentState(this.state,
      {this.student,
      this.basicInfo,
      required this.gyms,
      required this.loadingState,
      required this.teams,
      required this.gymName,
      required this.account});
}

sealed class StudentEvent {}

final class StudentLoggedIn extends StudentEvent {
  final Account account;
  final bool mitID;
  StudentLoggedIn(this.account, this.mitID);
}

final class StudentLoggedOut extends StudentEvent {}

final class LaunchedApp extends StudentEvent {}

final class ResetError extends StudentEvent {}

final class UniloginEvent extends StudentEvent {
  final String authUrl;
  UniloginEvent(this.authUrl);
}

final class AutologinError extends StudentEvent {}

final class ListGyms extends StudentEvent {}

final class RefreshTeams extends StudentEvent {}

final class UniloginFailure extends StudentEvent {}

final class Demologin extends StudentEvent {}

final class CancelUnilogin extends StudentEvent {}

class StudentBloc extends Bloc<StudentEvent, StudentState> {
  final LoginService loginService = LoginService();
  StudentBloc()
      : super(StudentState(StudentStates.loading,
            gyms: [],
            teams: [],
            loadingState: LoadingStates.normal,
            gymName: "",
            account: null)) {
    on<CancelUnilogin>(
      (event, emit) async {
        add(ResetError());
        return emit(state.copyWith(state: StudentStates.unauthorized));
      },
    );

    on<UniloginFailure>(
      (event, emit) {
        return emit(state.copyWith(state: StudentStates.mitIDError));
      },
    );

    on<Demologin>(
      (event, emit) {
        var student = Account(24, "", "").demoLogin();
        emit(state.copyWith(state: StudentStates.authorized, student: student));
      },
    );

    on<ListGyms>(
      (event, emit) async {
        var startState = state.state;
        emit(state.copyWith(state: StudentStates.loading));
        var gyms = await GymController().list();
        emit(state.copyWith(gyms: gyms, state: startState));
      },
    );

    on<AutologinError>((event, emit) async {
      await loginService.loadSaved();
    });

    on<UniloginEvent>(
      (event, emit) async {
        if (state.account != null) {
          var student = await state.account?.uniloginLogin(event.authUrl);
          if (student != null) {
            emit(state.copyWith(
              state: StudentStates.authorized,
              student: student,
            ));
            LoginService().save(state.account!, student);
            var cacheState =
                await CachingService(student, state.gyms).loadSaved();
            return emit(state.copyWith(
                teams: cacheState.teams, gymName: cacheState.gymName));
          }
        }
      },
    );

    on<LaunchedApp>((event, emit) async {
      emit(state.copyWith(state: StudentStates.loading));
      try {
        var student = await loginService.loadSaved();
        if (student != null) {
          emit(state.copyWith(
              student: student, state: StudentStates.authorized));
          var cacheState =
              await CachingService(student, state.gyms).loadSaved();
          return emit(state.copyWith(
              teams: cacheState.teams, gymName: cacheState.gymName));
        }
        emit(state.copyWith(state: StudentStates.unauthorized));
        add(ListGyms());
      } catch (e) {
        await loginService.delete();
        emit(state.copyWith(state: StudentStates.internetError));
      }
    });

    on<StudentLoggedIn>((event, emit) async {
      emit(state.copyWith(state: StudentStates.loading));
      try {
        Student? student;
        var account = event.account;
        if (!event.mitID) {
          student = await loginService.login(account);
        }
        if (student == null) {
          // fucking handle mitid

          return emit(
              state.copyWith(state: StudentStates.unilogin, account: account));
        }

        emit(state.copyWith(
          state: StudentStates.authorized,
          student: student,
        ));
        var cacheState = await CachingService(student, state.gyms).loadSaved();
        return emit(state.copyWith(
            teams: cacheState.teams, gymName: cacheState.gymName));
      } catch (e) {
        emit(state.copyWith(state: StudentStates.internetError));
      }
    });

    on<StudentLoggedOut>((event, emit) async {
      emit(state.copyWith(state: StudentStates.loading));
      await loginService.delete();
      await CachingService(state.student!, state.gyms).deleteAll();
      await clearCookies();
      emit(state.copyWith(state: StudentStates.unauthorized, student: null));
      add(ListGyms());
    });

    on<ResetError>(
      (event, emit) async {
        await clearCookies();
        emit(state.copyWith(state: StudentStates.unauthorized));
      },
    );

    on<RefreshTeams>((event, emit) async {
      if (state.student != null) {
        var newTeams = await CachingService(state.student!, state.gyms)
            .loadSaved(forceTeams: true);
        emit(state.copyWith(teams: newTeams.teams));
      }
    });
  }
}

StudentBloc getStudentBloc(BuildContext context) {
  return context.read<StudentBloc>();
}
